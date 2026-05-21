import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function colorDistance(r, g, b, target) {
  return Math.sqrt((r - target.r) ** 2 + (g - target.g) ** 2 + (b - target.b) ** 2);
}

export function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

export async function keyFrameBuffer(inputBuffer, settings) {
  const image = sharp(inputBuffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const tolerance = Number(settings.tolerance);
  const feather = Number(settings.feather);
  const softRange = Math.max(1, feather);

  for (let index = 0; index < output.length; index += info.channels) {
    const r = output[index];
    const g = output[index + 1];
    const b = output[index + 2];
    const distance = colorDistance(r, g, b, settings.backgroundColor);

    let alpha = 255;
    if (distance <= tolerance) {
      alpha = 0;
    } else if (distance <= tolerance + softRange) {
      alpha = Math.round(((distance - tolerance) / softRange) * 255);
    }

    if (settings.despill > 0 && settings.backgroundColor.g > settings.backgroundColor.r + 60) {
      const reduction = settings.despill / 100;
      output[index + 1] = Math.max(0, Math.round(g - Math.max(0, g - Math.max(r, b)) * reduction));
    }
    output[index + 3] = Math.min(output[index + 3], alpha);
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels
    }
  })
    .png()
    .toBuffer();
}

export async function keyFrameFile(inputPath, outputPath, settings) {
  const input = await fs.readFile(inputPath);
  const output = await keyFrameBuffer(input, settings);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output);
}
