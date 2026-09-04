use std::{path::PathBuf, sync::Arc};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::StatusCode,
    routing::{get, post},
};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::{fs, io::AsyncWriteExt};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    config::{Config, MAX_UPLOAD_BYTES},
    error::AppError,
    jobs::{ExportResult, Job, JobStatus, JobStore, SheetUrl},
    keying::{Rgb, hex_to_rgb, key_frame_file},
    media::{
        assert_ffmpeg_available, detect_edge_color_from_path, extract_frames, extract_sample_frame,
        probe_video,
    },
    sprite_sheet::{create_sprite_sheets, zip_directory},
};

const MULTIPART_LIMIT_BYTES: usize = (MAX_UPLOAD_BYTES as usize) + (1024 * 1024);
const MAX_EXPORT_FRAMES: usize = 1_200;
const MAX_TOTAL_FRAME_PIXELS: u64 = 500_000_000;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub jobs: Arc<JobStore>,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        fs::create_dir_all(&config.workspace_dir).await?;
        fs::create_dir_all(&config.export_dir).await?;
        Ok(Self {
            config: Arc::new(config),
            jobs: Arc::new(JobStore::default()),
        })
    }
}

#[derive(Serialize)]
struct JobEnvelope<T> {
    job: T,
}

#[derive(Serialize)]
struct UploadResponse {
    job: crate::jobs::PublicJob,
    metadata: crate::media::VideoMetadata,
}

#[derive(Serialize)]
struct DetectionResponse {
    detection: crate::media::BackgroundDetection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    mode: Option<String>,
    background_color: Option<String>,
    tolerance: Option<f64>,
    feather: Option<f64>,
    despill: Option<f64>,
    fps: Option<f64>,
    scale: Option<f64>,
    max_sheet_width: Option<f64>,
    max_sheet_height: Option<f64>,
    padding: Option<f64>,
    extrude: Option<f64>,
}

#[derive(Clone, Debug)]
struct ExportSettings {
    mode: String,
    background_color: Rgb,
    tolerance: f64,
    feather: f64,
    despill: f64,
    fps: f64,
    scale: f64,
    max_sheet_width: u32,
    max_sheet_height: u32,
    padding: u32,
    extrude: u32,
}

fn clamp_number(value: Option<f64>, fallback: f64, min: f64, max: f64) -> f64 {
    value
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
        .clamp(min, max)
}

fn clamp_u32(value: Option<f64>, fallback: u32, min: u32, max: u32) -> u32 {
    clamp_number(value, f64::from(fallback), f64::from(min), f64::from(max)).round() as u32
}

fn sanitize_export_settings(
    request: ExportRequest,
    defaults: &crate::config::Defaults,
) -> Result<ExportSettings, AppError> {
    let background = request.background_color.as_deref().unwrap_or("#ffffff");
    let background_color =
        hex_to_rgb(background).map_err(|error| AppError::bad_request(error.to_string()))?;
    let mode = request.mode.unwrap_or_else(|| "keying".to_owned());

    Ok(ExportSettings {
        mode,
        background_color,
        tolerance: clamp_number(request.tolerance, defaults.tolerance, 0.0, 100.0),
        feather: clamp_number(request.feather, defaults.feather, 0.0, 64.0),
        despill: clamp_number(request.despill, defaults.despill, 0.0, 100.0),
        fps: clamp_number(request.fps, defaults.fps, 1.0, 30.0),
        scale: clamp_number(request.scale, defaults.scale, 0.1, 1.0),
        max_sheet_width: clamp_u32(
            request.max_sheet_width,
            defaults.max_sheet_width,
            512,
            defaults.max_sheet_width,
        ),
        max_sheet_height: clamp_u32(
            request.max_sheet_height,
            defaults.max_sheet_height,
            512,
            defaults.max_sheet_height,
        ),
        padding: clamp_u32(request.padding, defaults.padding, 0, 32),
        extrude: clamp_u32(request.extrude, defaults.extrude, 0, 8),
    })
}

fn validate_export_for_job(job: &Job, settings: &ExportSettings) -> Result<(), AppError> {
    let Some(metadata) = job.video_metadata.as_ref() else {
        return Ok(());
    };

    let scaled_width = (f64::from(metadata.width) * settings.scale).ceil() as u64;
    let scaled_height = (f64::from(metadata.height) * settings.scale).ceil() as u64;
    let cell_width = scaled_width.saturating_add(u64::from(settings.extrude) * 2);
    let cell_height = scaled_height.saturating_add(u64::from(settings.extrude) * 2);
    if cell_width > u64::from(settings.max_sheet_width)
        || cell_height > u64::from(settings.max_sheet_height)
    {
        return Err(AppError::bad_request(format!(
            "Scaled frame ({scaled_width}x{scaled_height}, extrude {}) does not fit inside the requested {}x{} sprite sheet.",
            settings.extrude, settings.max_sheet_width, settings.max_sheet_height
        )));
    }

    if metadata.duration > 0.0 {
        let estimated_frames = (metadata.duration * settings.fps).ceil();
        if estimated_frames > MAX_EXPORT_FRAMES as f64 {
            return Err(AppError::bad_request(format!(
                "Export would create about {estimated_frames:.0} frames; the safety limit is {MAX_EXPORT_FRAMES}."
            )));
        }

        let total_pixels = scaled_width
            .saturating_mul(scaled_height)
            .saturating_mul(estimated_frames as u64);
        if total_pixels > MAX_TOTAL_FRAME_PIXELS {
            return Err(AppError::bad_request(format!(
                "Export would process about {total_pixels} pixels; reduce FPS, resolution, or scale."
            )));
        }
    }

    Ok(())
}

pub fn build_router(state: AppState) -> Router {
    let public_dir = state.config.public_dir.clone();
    let index_file = public_dir.join("index.html");
    let export_dir = state.config.export_dir.clone();

    Router::new()
        .route("/api/health", get(health))
        .route("/api/upload", post(upload))
        .route("/api/jobs/{id}", get(get_job))
        .route("/api/jobs/{id}/detect-background", post(detect_background))
        .route("/api/jobs/{id}/export", post(export_job))
        .route("/api/ai/status", get(ai_status))
        .nest_service("/exports", ServeDir::new(export_dir))
        .fallback_service(ServeDir::new(public_dir).fallback(ServeFile::new(index_file)))
        .layer(DefaultBodyLimit::max(MULTIPART_LIMIT_BYTES))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health() -> Json<Value> {
    match assert_ffmpeg_available().await {
        Ok(tools) => Json(json!({
            "ok": true,
            "app": "godot-video-background-remover-rs",
            "tools": {
                "available": true,
                "ffmpeg": tools.ffmpeg,
                "ffprobe": tools.ffprobe
            }
        })),
        Err(error) => Json(json!({
            "ok": true,
            "app": "godot-video-background-remover-rs",
            "tools": {
                "available": false,
                "error": error.to_string()
            }
        })),
    }
}

async fn upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::bad_request(error.body_text()))?
    {
        if field.name() != Some("video") {
            continue;
        }

        let content_type = field.content_type().unwrap_or_default().to_owned();
        if !content_type.starts_with("video/") {
            return Err(AppError::bad_request("Only video files allowed."));
        }

        let original_name = field
            .file_name()
            .filter(|name| !name.is_empty())
            .unwrap_or("video")
            .to_owned();
        let id = Uuid::new_v4();
        let mut job = Job::new(&state.config, id, original_name);
        let job_dir = job
            .input_path
            .parent()
            .context("job input path has no parent")?
            .to_path_buf();
        fs::create_dir_all(&job_dir).await?;
        fs::create_dir_all(&job.sample_dir).await?;
        fs::create_dir_all(&job.frames_dir).await?;
        fs::create_dir_all(&job.output_dir).await?;

        let mut output = fs::File::create(&job.input_path).await?;
        let mut written = 0_u64;

        while let Some(chunk) = field
            .chunk()
            .await
            .map_err(|error| AppError::bad_request(error.body_text()))?
        {
            written = written.saturating_add(chunk.len() as u64);
            if written > MAX_UPLOAD_BYTES {
                drop(output);
                let _ = fs::remove_dir_all(&job_dir).await;
                return Err(AppError::payload_too_large(
                    "Video exceeds the 200 MiB upload limit.",
                ));
            }
            output.write_all(&chunk).await?;
        }
        output.flush().await?;
        drop(output);

        let metadata = match probe_video(&job.input_path).await {
            Ok(metadata) => metadata,
            Err(error) => {
                let _ = fs::remove_dir_all(&job_dir).await;
                return Err(AppError::bad_request(format!(
                    "Uploaded file is not a readable video: {error}"
                )));
            }
        };

        job.video_metadata = Some(metadata.clone());
        let public_job = job.public();
        state.jobs.insert(job).await;
        return Ok(Json(UploadResponse {
            job: public_job,
            metadata,
        }));
    }

    Err(AppError::bad_request("No video file uploaded."))
}

fn parse_job_id(id: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(id).map_err(|_| AppError::not_found("Job not found."))
}

async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<JobEnvelope<crate::jobs::PublicJob>>, AppError> {
    let id = parse_job_id(&id)?;
    let job = state
        .jobs
        .get(id)
        .await
        .ok_or_else(|| AppError::not_found("Job not found."))?;
    Ok(Json(JobEnvelope { job: job.public() }))
}

async fn detect_background(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DetectionResponse>, AppError> {
    let id = parse_job_id(&id)?;
    let job = state
        .jobs
        .get(id)
        .await
        .ok_or_else(|| AppError::not_found("Job not found."))?;
    let sample_path = job.sample_dir.join("sample-000.png");

    extract_sample_frame(&job.input_path, &sample_path, 0.0).await?;
    let detection = tokio::task::spawn_blocking(move || detect_edge_color_from_path(&sample_path))
        .await
        .map_err(|error| {
            AppError::internal(format!("background detector task failed: {error}"))
        })??;

    Ok(Json(DetectionResponse { detection }))
}

async fn export_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<ExportRequest>,
) -> Result<(StatusCode, Json<JobEnvelope<crate::jobs::PublicJob>>), AppError> {
    let id = parse_job_id(&id)?;
    let current = state
        .jobs
        .get(id)
        .await
        .ok_or_else(|| AppError::not_found("Job not found."))?;

    let settings = sanitize_export_settings(request, &state.config.defaults)?;
    validate_export_for_job(&current, &settings)?;
    if settings.mode == "ai" {
        return Err(AppError::not_implemented(
            "髮絲 AI 模式尚未綁定本機 ONNX 模型；目前提供 Rust 快速 keying 匯出。",
        ));
    }
    if settings.mode != "keying" {
        return Err(AppError::bad_request("mode must be either keying or ai"));
    }

    let job = state
        .jobs
        .begin_export(id)
        .await
        .ok_or_else(|| AppError::conflict("This job is already exporting."))?;

    let response = job.public();
    let task_state = state.clone();
    let cleanup_frames_dir = job.frames_dir.clone();
    let cleanup_output_dir = job.output_dir.clone();
    let cleanup_zip_path = state.config.export_dir.join(format!("{id}.zip"));
    tokio::spawn(async move {
        if let Err(error) = run_export(task_state.clone(), job, settings).await {
            tracing::error!(job_id = %id, error = ?error, "export failed");
            let _ = fs::remove_dir_all(&cleanup_frames_dir).await;
            let _ = fs::remove_dir_all(&cleanup_output_dir).await;
            let _ = fs::remove_file(&cleanup_zip_path).await;
            let message = error.to_string();
            task_state
                .jobs
                .update(id, |job| {
                    job.status = JobStatus::Failed;
                    job.error = Some(message);
                })
                .await;
        }
    });

    Ok((StatusCode::ACCEPTED, Json(JobEnvelope { job: response })))
}

async fn run_export(state: AppState, job: Job, settings: ExportSettings) -> anyhow::Result<()> {
    let _ = fs::remove_dir_all(&job.frames_dir).await;
    fs::create_dir_all(&job.frames_dir).await?;
    let _ = fs::remove_dir_all(&job.output_dir).await;
    fs::create_dir_all(&job.output_dir).await?;

    let raw_pattern = job.frames_dir.join("raw-%06d.png");
    extract_frames(
        &job.input_path,
        &raw_pattern,
        settings.fps,
        settings.scale,
        MAX_EXPORT_FRAMES,
    )
    .await?;
    state.jobs.update(job.id, |job| job.progress = 35).await;

    let mut raw_frames = Vec::new();
    let mut entries = fs::read_dir(&job.frames_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("raw-") && name.ends_with(".png") {
            raw_frames.push(entry.path());
        }
    }
    raw_frames.sort();
    if raw_frames.len() > MAX_EXPORT_FRAMES {
        anyhow::bail!("export exceeded the {MAX_EXPORT_FRAMES}-frame safety limit");
    }
    if raw_frames.is_empty() {
        anyhow::bail!("ffmpeg extracted zero frames");
    }

    let first_raw_frame = raw_frames[0].clone();
    let frame_count = u64::try_from(raw_frames.len()).unwrap_or(u64::MAX);
    let actual_pixels = tokio::task::spawn_blocking(move || -> anyhow::Result<u64> {
        let (width, height) = image::image_dimensions(&first_raw_frame)
            .with_context(|| format!("failed to inspect {}", first_raw_frame.display()))?;
        Ok(u64::from(width)
            .saturating_mul(u64::from(height))
            .saturating_mul(frame_count))
    })
    .await
    .context("frame-budget worker panicked")??;
    if actual_pixels > MAX_TOTAL_FRAME_PIXELS {
        anyhow::bail!(
            "export would process {actual_pixels} pixels; reduce FPS, resolution, or scale"
        );
    }

    let keyed_dir = job.output_dir.join("frames");
    fs::create_dir_all(&keyed_dir).await?;
    let keyed_frames = build_keyed_frame_paths(&keyed_dir, raw_frames.len());
    let background_color = settings.background_color;
    let tolerance = settings.tolerance;
    let feather = settings.feather;
    let despill = settings.despill;
    let raw_for_keying = raw_frames.clone();
    let keyed_for_keying = keyed_frames.clone();

    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        raw_for_keying
            .par_iter()
            .zip(keyed_for_keying.par_iter())
            .try_for_each(|(input, output)| {
                key_frame_file(input, output, background_color, tolerance, feather, despill)
            })
    })
    .await
    .context("keying worker panicked")??;
    let _ = fs::remove_dir_all(&job.frames_dir).await;
    state.jobs.update(job.id, |job| job.progress = 70).await;

    let sprite_paths = keyed_frames.clone();
    let output_dir = job.output_dir.clone();
    let fps = settings.fps;
    let max_sheet_width = settings.max_sheet_width;
    let max_sheet_height = settings.max_sheet_height;
    let padding = settings.padding;
    let extrude = settings.extrude;

    let metadata = tokio::task::spawn_blocking(move || {
        create_sprite_sheets(
            &sprite_paths,
            &output_dir,
            fps,
            max_sheet_width,
            max_sheet_height,
            padding,
            extrude,
        )
    })
    .await
    .context("sprite-sheet worker panicked")??;
    fs::remove_dir_all(&keyed_dir).await?;

    let zip_path = state.config.export_dir.join(format!("{}.zip", job.id));
    let source_dir = job.output_dir.clone();
    let zip_path_for_worker = zip_path.clone();
    tokio::task::spawn_blocking(move || zip_directory(&source_dir, &zip_path_for_worker))
        .await
        .context("zip worker panicked")??;

    let _ = fs::remove_dir_all(&job.frames_dir).await;

    let sheet_urls = metadata
        .sheets
        .iter()
        .map(|sheet| SheetUrl {
            file: sheet.file.clone(),
            url: format!("/exports/{}/{}", job.id, sheet.file),
        })
        .collect();

    let result = ExportResult {
        metadata,
        sheet_urls,
        download_url: format!("/exports/{}.zip", job.id),
    };

    state
        .jobs
        .update(job.id, |job| {
            job.status = JobStatus::Done;
            job.progress = 100;
            job.result = Some(result);
            job.error = None;
        })
        .await;

    Ok(())
}

fn build_keyed_frame_paths(directory: &std::path::Path, frame_count: usize) -> Vec<PathBuf> {
    (0..frame_count)
        .map(|index| directory.join(format!("frame-{index:06}.png")))
        .collect()
}

async fn ai_status() -> Json<Value> {
    Json(json!({
        "available": false,
        "provider": "local-onnx",
        "message": "髮絲 AI 模式尚未安裝本機 ONNX 模型。快速 keying 完全在本機 Rust 流程中執行。",
        "recommendedModels": ["isnet-general-use", "u2net_human_seg", "silueta"]
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Defaults;

    #[test]
    fn clamps_export_settings() {
        let settings = sanitize_export_settings(
            ExportRequest {
                mode: None,
                background_color: Some("#00ff00".to_owned()),
                tolerance: Some(999.0),
                feather: Some(-5.0),
                despill: Some(f64::NAN),
                fps: Some(999.0),
                scale: Some(99.0),
                max_sheet_width: Some(999_999.0),
                max_sheet_height: Some(16.0),
                padding: Some(999.0),
                extrude: Some(-3.0),
            },
            &Defaults::default(),
        )
        .unwrap();

        assert_eq!(settings.tolerance, 100.0);
        assert_eq!(settings.feather, 0.0);
        assert_eq!(settings.despill, Defaults::default().despill);
        assert_eq!(settings.fps, 30.0);
        assert_eq!(settings.scale, 1.0);
        assert_eq!(settings.max_sheet_width, 4096);
        assert_eq!(settings.max_sheet_height, 512);
        assert_eq!(settings.padding, 32);
        assert_eq!(settings.extrude, 0);
    }

    #[test]
    fn rejects_invalid_color() {
        let request = ExportRequest {
            mode: None,
            background_color: Some("green".to_owned()),
            tolerance: None,
            feather: None,
            despill: None,
            fps: None,
            scale: None,
            max_sheet_width: None,
            max_sheet_height: None,
            padding: None,
            extrude: None,
        };
        assert!(sanitize_export_settings(request, &Defaults::default()).is_err());
    }
}
