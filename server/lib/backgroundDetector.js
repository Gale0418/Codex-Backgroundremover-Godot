import sharp from "sharp";

function distance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function classifyBackground(rgb) {
  const presets = [
    { kind: "white", rgb: { r: 255, g: 255, b: 255 } },
    { kind: "black", rgb: { r: 0, g: 0, b: 0 } },
    { kind: "green", rgb: { r: 0, g: 255, b: 0 } }
  ];
  const best = presets
    .map((preset) => ({ ...preset, distance: distance(rgb, preset.rgb) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (best.distance <= 80) return best;
  return { kind: "custom", rgb, distance: best.distance };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export async function detectEdgeColorFromImage(imageBuffer) {
  const image = sharp(imageBuffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const edge = Math.max(2, Math.round(Math.min(info.width, info.height) * 0.08));
  const pixels = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const isEdge = x < edge || y < edge || x >= info.width - edge || y >= info.height - edge;
      if (!isEdge) continue;
      const offset = (y * info.width + x) * info.channels;
      pixels.push({
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2]
      });
    }
  }

  const rgb = {
    r: Math.round(median(pixels.map((pixel) => pixel.r))),
    g: Math.round(median(pixels.map((pixel) => pixel.g))),
    b: Math.round(median(pixels.map((pixel) => pixel.b)))
  };
  return {
    rgb,
    hex: `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    classification: classifyBackground(rgb)
  };
}
