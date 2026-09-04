use std::path::Path;

use anyhow::{Context, bail};
use image::RgbaImage;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

pub fn hex_to_rgb(value: &str) -> anyhow::Result<Rgb> {
    let value = value.strip_prefix('#').unwrap_or(value);
    if value.len() != 6 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("backgroundColor must be a 6-digit hex color");
    }

    Ok(Rgb {
        r: u8::from_str_radix(&value[0..2], 16)?,
        g: u8::from_str_radix(&value[2..4], 16)?,
        b: u8::from_str_radix(&value[4..6], 16)?,
    })
}

pub fn key_rgba_in_place(
    image: &mut RgbaImage,
    background: Rgb,
    tolerance: f64,
    feather: f64,
    despill: f64,
) {
    let soft_range = feather.max(1.0);
    let reduction = (despill / 100.0).clamp(0.0, 1.0);
    let green_screen = i16::from(background.g) > i16::from(background.r) + 60;

    image
        .as_flat_samples_mut()
        .samples
        .par_chunks_mut(4)
        .for_each(|pixel| {
            let r = pixel[0];
            let g = pixel[1];
            let b = pixel[2];

            let dr = f64::from(r) - f64::from(background.r);
            let dg = f64::from(g) - f64::from(background.g);
            let db = f64::from(b) - f64::from(background.b);
            let distance = (dr * dr + dg * dg + db * db).sqrt();

            let alpha = if distance <= tolerance {
                0
            } else if distance <= tolerance + soft_range {
                (((distance - tolerance) / soft_range) * 255.0).round() as u8
            } else {
                255
            };

            if reduction > 0.0 && green_screen {
                let dominant_green = i16::from(g) - i16::from(r.max(b));
                if dominant_green > 0 {
                    let spill = (f64::from(dominant_green) * reduction).round() as u8;
                    pixel[1] = g.saturating_sub(spill);
                }
            }

            pixel[3] = pixel[3].min(alpha);
        });
}

pub fn key_frame_file(
    input_path: &Path,
    output_path: &Path,
    background: Rgb,
    tolerance: f64,
    feather: f64,
    despill: f64,
) -> anyhow::Result<()> {
    let mut image = image::open(input_path)
        .with_context(|| format!("failed to decode frame {}", input_path.display()))?
        .to_rgba8();

    key_rgba_in_place(&mut image, background, tolerance, feather, despill);

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    image
        .save(output_path)
        .with_context(|| format!("failed to write keyed frame {}", output_path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use image::{Rgba, RgbaImage};

    use super::*;

    #[test]
    fn parses_hex_color() {
        assert_eq!(
            hex_to_rgb("#12abF0").unwrap(),
            Rgb {
                r: 0x12,
                g: 0xab,
                b: 0xf0,
            }
        );
        assert!(hex_to_rgb("#fff").is_err());
        assert!(hex_to_rgb("#xyzxyz").is_err());
    }

    #[test]
    fn removes_matching_pixels_and_preserves_foreground() {
        let mut image = RgbaImage::from_vec(2, 1, vec![0, 255, 0, 255, 255, 0, 0, 200]).unwrap();

        key_rgba_in_place(&mut image, Rgb { r: 0, g: 255, b: 0 }, 10.0, 4.0, 0.0);

        assert_eq!(image.get_pixel(0, 0), &Rgba([0, 255, 0, 0]));
        assert_eq!(image.get_pixel(1, 0), &Rgba([255, 0, 0, 200]));
    }

    #[test]
    fn despill_reduces_only_excess_green() {
        let mut image = RgbaImage::from_pixel(1, 1, Rgba([20, 200, 30, 255]));
        key_rgba_in_place(&mut image, Rgb { r: 0, g: 255, b: 0 }, 0.0, 1.0, 100.0);
        assert_eq!(image.get_pixel(0, 0)[1], 30);
    }
}
