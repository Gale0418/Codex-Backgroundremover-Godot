use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
};

use anyhow::{Context, bail};
use image::{Rgba, RgbaImage, imageops};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SheetLayout {
    pub cell_width: u32,
    pub cell_height: u32,
    pub columns: u32,
    pub rows_per_sheet: u32,
    pub frames_per_sheet: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetMetadata {
    pub file: String,
    pub first_frame: usize,
    pub frame_count: usize,
    pub columns: u32,
    pub rows: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMetadata {
    pub index: usize,
    pub sheet: String,
    pub cell_rect: Rect,
    pub frame_rect: Rect,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteMetadata {
    pub fps: f64,
    pub frame_count: usize,
    pub frame_width: u32,
    pub frame_height: u32,
    pub cell_width: u32,
    pub cell_height: u32,
    pub padding: u32,
    pub extrude: u32,
    pub sheets: Vec<SheetMetadata>,
    pub frames: Vec<FrameMetadata>,
}

pub fn plan_sheet_layout(
    frame_width: u32,
    frame_height: u32,
    frame_count: usize,
    max_sheet_width: u32,
    max_sheet_height: u32,
    padding: u32,
    extrude: u32,
) -> SheetLayout {
    let cell_width = frame_width.saturating_add(extrude.saturating_mul(2));
    let cell_height = frame_height.saturating_add(extrude.saturating_mul(2));

    let horizontal_stride = cell_width.saturating_add(padding).max(1);
    let vertical_stride = cell_height.saturating_add(padding).max(1);

    let width_capacity = max_sheet_width.saturating_add(padding) / horizontal_stride;
    let height_capacity = max_sheet_height.saturating_add(padding) / vertical_stride;

    let columns = width_capacity
        .max(1)
        .min(u32::try_from(frame_count.max(1)).unwrap_or(u32::MAX));
    let rows_per_sheet = height_capacity.max(1);
    let frames_per_sheet = usize::try_from(columns.saturating_mul(rows_per_sheet))
        .unwrap_or(usize::MAX)
        .max(1);

    SheetLayout {
        cell_width,
        cell_height,
        columns,
        rows_per_sheet,
        frames_per_sheet,
    }
}

fn extrude_frame(frame: &RgbaImage, extrude: u32) -> RgbaImage {
    if extrude == 0 {
        return frame.clone();
    }

    let (width, height) = frame.dimensions();
    let out_width = width.saturating_add(extrude.saturating_mul(2));
    let out_height = height.saturating_add(extrude.saturating_mul(2));
    let mut output = RgbaImage::from_pixel(out_width, out_height, Rgba([0, 0, 0, 0]));

    for y in 0..out_height {
        let source_y = y.saturating_sub(extrude).min(height.saturating_sub(1));
        for x in 0..out_width {
            let source_x = x.saturating_sub(extrude).min(width.saturating_sub(1));
            output.put_pixel(x, y, *frame.get_pixel(source_x, source_y));
        }
    }

    output
}

pub fn create_sprite_sheets(
    frame_paths: &[PathBuf],
    output_dir: &Path,
    fps: f64,
    max_sheet_width: u32,
    max_sheet_height: u32,
    padding: u32,
    extrude: u32,
) -> anyhow::Result<SpriteMetadata> {
    if frame_paths.is_empty() {
        bail!("No frames available for sprite sheet export.");
    }

    std::fs::create_dir_all(output_dir)?;
    let first = image::open(&frame_paths[0])
        .with_context(|| format!("failed to read {}", frame_paths[0].display()))?
        .to_rgba8();
    let (frame_width, frame_height) = first.dimensions();

    if frame_width == 0 || frame_height == 0 {
        bail!("frame dimensions must be non-zero");
    }

    let cell_width = frame_width.saturating_add(extrude.saturating_mul(2));
    let cell_height = frame_height.saturating_add(extrude.saturating_mul(2));
    if cell_width > max_sheet_width || cell_height > max_sheet_height {
        bail!(
            "frame cell {cell_width}x{cell_height} does not fit inside {max_sheet_width}x{max_sheet_height} sheet"
        );
    }

    let layout = plan_sheet_layout(
        frame_width,
        frame_height,
        frame_paths.len(),
        max_sheet_width,
        max_sheet_height,
        padding,
        extrude,
    );

    let mut sheets = Vec::new();
    let mut frames = Vec::with_capacity(frame_paths.len());

    for (sheet_index, slice) in frame_paths.chunks(layout.frames_per_sheet).enumerate() {
        let rows = u32::try_from(slice.len())
            .unwrap_or(u32::MAX)
            .div_ceil(layout.columns);
        let width = layout
            .columns
            .saturating_mul(layout.cell_width)
            .saturating_add(layout.columns.saturating_sub(1).saturating_mul(padding));
        let height = rows
            .saturating_mul(layout.cell_height)
            .saturating_add(rows.saturating_sub(1).saturating_mul(padding));
        let file_name = format!("sprite-sheet-{:03}.png", sheet_index + 1);
        let sheet_path = output_dir.join(&file_name);
        let mut sheet = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 0]));

        for (local_index, frame_path) in slice.iter().enumerate() {
            let frame = image::open(frame_path)
                .with_context(|| format!("failed to read {}", frame_path.display()))?
                .to_rgba8();
            if frame.dimensions() != (frame_width, frame_height) {
                bail!(
                    "frame {} has mismatched dimensions {:?}; expected {}x{}",
                    frame_path.display(),
                    frame.dimensions(),
                    frame_width,
                    frame_height
                );
            }

            let local_index_u32 = u32::try_from(local_index).unwrap_or(u32::MAX);
            let col = local_index_u32 % layout.columns;
            let row = local_index_u32 / layout.columns;
            let left = col.saturating_mul(layout.cell_width.saturating_add(padding));
            let top = row.saturating_mul(layout.cell_height.saturating_add(padding));
            let cell = extrude_frame(&frame, extrude);
            imageops::overlay(&mut sheet, &cell, i64::from(left), i64::from(top));

            frames.push(FrameMetadata {
                index: sheet_index
                    .saturating_mul(layout.frames_per_sheet)
                    .saturating_add(local_index),
                sheet: file_name.clone(),
                cell_rect: Rect {
                    x: left,
                    y: top,
                    width: layout.cell_width,
                    height: layout.cell_height,
                },
                frame_rect: Rect {
                    x: left.saturating_add(extrude),
                    y: top.saturating_add(extrude),
                    width: frame_width,
                    height: frame_height,
                },
            });
        }

        sheet
            .save(&sheet_path)
            .with_context(|| format!("failed to write {}", sheet_path.display()))?;

        sheets.push(SheetMetadata {
            file: file_name,
            first_frame: sheet_index.saturating_mul(layout.frames_per_sheet),
            frame_count: slice.len(),
            columns: layout.columns,
            rows,
            width,
            height,
        });
    }

    let metadata = SpriteMetadata {
        fps,
        frame_count: frame_paths.len(),
        frame_width,
        frame_height,
        cell_width: layout.cell_width,
        cell_height: layout.cell_height,
        padding,
        extrude,
        sheets,
        frames,
    };

    let metadata_path = output_dir.join("metadata.json");
    std::fs::write(&metadata_path, serde_json::to_vec_pretty(&metadata)?)?;
    Ok(metadata)
}

pub fn zip_directory(source_dir: &Path, output_path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = File::create(output_path)
        .with_context(|| format!("failed to create {}", output_path.display()))?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for entry in WalkDir::new(source_dir).follow_links(false) {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(source_dir)?;
        archive.start_file_from_path(relative, options)?;
        let mut input = File::open(entry.path())?;
        io::copy(&mut input, &mut archive)?;
    }

    archive.finish()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn plans_padding_and_extrude() {
        let layout = plan_sheet_layout(64, 32, 100, 256, 128, 2, 1);
        assert_eq!(layout.cell_width, 66);
        assert_eq!(layout.cell_height, 34);
        assert_eq!(layout.columns, 3);
        assert_eq!(layout.rows_per_sheet, 3);
        assert_eq!(layout.frames_per_sheet, 9);
    }

    #[test]
    fn writes_metadata_with_frame_rect_inside_cell_rect() {
        let temp = tempdir().unwrap();
        let frames_dir = temp.path().join("frames");
        let output_dir = temp.path().join("out");
        std::fs::create_dir_all(&frames_dir).unwrap();

        let mut paths = Vec::new();
        for index in 0..3 {
            let path = frames_dir.join(format!("{index}.png"));
            RgbaImage::from_pixel(4, 2, Rgba([255, 0, 0, 255]))
                .save(&path)
                .unwrap();
            paths.push(path);
        }

        let metadata = create_sprite_sheets(&paths, &output_dir, 12.0, 32, 32, 2, 1).unwrap();
        assert_eq!(metadata.frame_count, 3);
        assert_eq!(metadata.frames[0].cell_rect.width, 6);
        assert_eq!(metadata.frames[0].frame_rect.x, 1);
        assert!(output_dir.join("sprite-sheet-001.png").exists());
        assert!(output_dir.join("metadata.json").exists());
    }
}
