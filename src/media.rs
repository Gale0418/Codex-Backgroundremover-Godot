use std::{path::Path, process::Output};

use anyhow::{Context, bail};
use serde::Serialize;
use serde_json::Value;
use tokio::process::Command;

use crate::keying::Rgb;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct BackgroundClassification {
    pub kind: String,
    pub rgb: Rgb,
    pub distance: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct BackgroundDetection {
    pub rgb: Rgb,
    pub hex: String,
    pub classification: BackgroundClassification,
}

#[derive(Clone, Debug, Serialize)]
pub struct ToolVersions {
    pub ffmpeg: String,
    pub ffprobe: String,
}

async fn command_output(mut command: Command, program: &str) -> anyhow::Result<Output> {
    let output = command
        .output()
        .await
        .with_context(|| format!("{program} failed to start"))?;
    if output.status.success() {
        Ok(output)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        bail!(
            "{program} exited with {}: {}",
            output.status,
            if stderr.is_empty() { stdout } else { stderr }
        );
    }
}

async fn version_line(program: &str) -> anyhow::Result<String> {
    let mut command = Command::new(program);
    command.arg("-version");
    let output = command_output(command, program).await?;
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or_default()
        .to_owned())
}

pub async fn assert_ffmpeg_available() -> anyhow::Result<ToolVersions> {
    let (ffmpeg, ffprobe) = tokio::try_join!(version_line("ffmpeg"), version_line("ffprobe"))?;
    Ok(ToolVersions { ffmpeg, ffprobe })
}

fn parse_rate(rate: &str) -> f64 {
    let mut parts = rate.split('/');
    let left = parts.next().and_then(|value| value.parse::<f64>().ok());
    let right = parts.next().and_then(|value| value.parse::<f64>().ok());
    match (left, right) {
        (Some(left), Some(right)) if left > 0.0 && right > 0.0 => {
            ((left / right) * 1000.0).round() / 1000.0
        }
        _ => 0.0,
    }
}

fn parse_number(value: Option<&Value>) -> f64 {
    value
        .and_then(|value| {
            value
                .as_f64()
                .or_else(|| value.as_str().and_then(|text| text.parse::<f64>().ok()))
        })
        .unwrap_or(0.0)
}

pub fn parse_probe_json(raw: &Value) -> anyhow::Result<VideoMetadata> {
    let streams = raw
        .get("streams")
        .and_then(Value::as_array)
        .context("ffprobe response did not contain streams")?;

    let video = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("video"))
        .context("No video stream found.")?;

    let width = video
        .get("width")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .context("video width is missing or invalid")?;
    let height = video
        .get("height")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .context("video height is missing or invalid")?;
    let fps = video
        .get("r_frame_rate")
        .and_then(Value::as_str)
        .map(parse_rate)
        .unwrap_or(0.0);
    let duration = {
        let stream_duration = parse_number(video.get("duration"));
        if stream_duration > 0.0 {
            stream_duration
        } else {
            parse_number(raw.get("format").and_then(|format| format.get("duration")))
        }
    };

    Ok(VideoMetadata {
        width,
        height,
        fps,
        duration,
    })
}

pub async fn probe_video(file_path: &Path) -> anyhow::Result<VideoMetadata> {
    let mut command = Command::new("ffprobe");
    command
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(file_path);
    let output = command_output(command, "ffprobe").await?;
    let raw: Value = serde_json::from_slice(&output.stdout).context("invalid ffprobe JSON")?;
    parse_probe_json(&raw)
}

pub async fn extract_frames(
    input_path: &Path,
    output_pattern: &Path,
    fps: f64,
    scale: f64,
    max_frames: usize,
) -> anyhow::Result<()> {
    let mut filters = vec![format!("fps={fps}")];
    if (scale - 1.0).abs() > f64::EPSILON {
        filters.push(format!("scale=iw*{scale}:ih*{scale}"));
    }
    let filter = filters.join(",");

    let mut command = Command::new("ffmpeg");
    command
        .args(["-y", "-i"])
        .arg(input_path)
        .args(["-vf", &filter, "-start_number", "0", "-frames:v"])
        .arg(max_frames.saturating_add(1).to_string())
        .arg(output_pattern);
    command_output(command, "ffmpeg").await?;
    Ok(())
}

pub async fn extract_sample_frame(
    input_path: &Path,
    output_path: &Path,
    timestamp_seconds: f64,
) -> anyhow::Result<()> {
    let timestamp = timestamp_seconds.to_string();
    let mut command = Command::new("ffmpeg");
    command
        .args(["-y", "-ss", &timestamp, "-i"])
        .arg(input_path)
        .args(["-frames:v", "1"])
        .arg(output_path);
    command_output(command, "ffmpeg").await?;
    Ok(())
}

fn color_distance(left: Rgb, right: Rgb) -> f64 {
    let dr = f64::from(left.r) - f64::from(right.r);
    let dg = f64::from(left.g) - f64::from(right.g);
    let db = f64::from(left.b) - f64::from(right.b);
    (dr * dr + dg * dg + db * db).sqrt()
}

pub fn classify_background(rgb: Rgb) -> BackgroundClassification {
    let presets = [
        (
            "white",
            Rgb {
                r: 255,
                g: 255,
                b: 255,
            },
        ),
        ("black", Rgb { r: 0, g: 0, b: 0 }),
        ("green", Rgb { r: 0, g: 255, b: 0 }),
    ];

    let (kind, preset, distance) = presets
        .iter()
        .map(|(kind, preset)| (*kind, *preset, color_distance(rgb, *preset)))
        .min_by(|left, right| left.2.total_cmp(&right.2))
        .expect("preset list is non-empty");

    if distance <= 80.0 {
        BackgroundClassification {
            kind: kind.to_owned(),
            rgb: preset,
            distance,
        }
    } else {
        BackgroundClassification {
            kind: "custom".to_owned(),
            rgb,
            distance,
        }
    }
}

fn median(values: &mut [u8]) -> u8 {
    if values.is_empty() {
        return 0;
    }
    values.sort_unstable();
    values[values.len() / 2]
}

pub fn detect_edge_color_from_image(image: &image::RgbaImage) -> BackgroundDetection {
    let (width, height) = image.dimensions();
    let edge = ((f64::from(width.min(height)) * 0.08).round() as u32).max(2);

    let mut red = Vec::new();
    let mut green = Vec::new();
    let mut blue = Vec::new();

    for (x, y, pixel) in image.enumerate_pixels() {
        let is_edge = x < edge
            || y < edge
            || x >= width.saturating_sub(edge)
            || y >= height.saturating_sub(edge);
        if is_edge {
            red.push(pixel[0]);
            green.push(pixel[1]);
            blue.push(pixel[2]);
        }
    }

    let rgb = Rgb {
        r: median(&mut red),
        g: median(&mut green),
        b: median(&mut blue),
    };

    BackgroundDetection {
        rgb,
        hex: format!("#{:02x}{:02x}{:02x}", rgb.r, rgb.g, rgb.b),
        classification: classify_background(rgb),
    }
}

pub fn detect_edge_color_from_path(path: &Path) -> anyhow::Result<BackgroundDetection> {
    let image = image::open(path)
        .with_context(|| format!("failed to decode sample frame {}", path.display()))?
        .to_rgba8();
    Ok(detect_edge_color_from_image(&image))
}

#[cfg(test)]
mod tests {
    use image::{Rgba, RgbaImage};
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_probe_metadata() {
        let raw = json!({
            "streams": [{
                "codec_type": "video",
                "width": 1920,
                "height": 1080,
                "r_frame_rate": "30000/1001",
                "duration": "2.5"
            }],
            "format": { "duration": "3.0" }
        });

        let metadata = parse_probe_json(&raw).unwrap();
        assert_eq!(metadata.width, 1920);
        assert_eq!(metadata.height, 1080);
        assert!((metadata.fps - 29.97).abs() < 0.001);
        assert!((metadata.duration - 2.5).abs() < f64::EPSILON);
    }

    #[test]
    fn detects_median_edge_color() {
        let mut image = RgbaImage::from_pixel(10, 10, Rgba([255, 255, 255, 255]));
        for y in 3..7 {
            for x in 3..7 {
                image.put_pixel(x, y, Rgba([255, 0, 0, 255]));
            }
        }

        let detection = detect_edge_color_from_image(&image);
        assert_eq!(
            detection.rgb,
            Rgb {
                r: 255,
                g: 255,
                b: 255
            }
        );
        assert_eq!(detection.classification.kind, "white");
    }
}
