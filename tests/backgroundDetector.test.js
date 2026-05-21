import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { classifyBackground, detectEdgeColorFromImage } from "../server/lib/backgroundDetector.js";

async function makeImage(width, height, background, center) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${background}" />
      <rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="${center}" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("background detection", () => {
  it("classifies common key colors", () => {
    expect(classifyBackground({ r: 252, g: 252, b: 248 }).kind).toBe("white");
    expect(classifyBackground({ r: 4, g: 5, b: 6 }).kind).toBe("black");
    expect(classifyBackground({ r: 10, g: 240, b: 30 }).kind).toBe("green");
    expect(classifyBackground({ r: 80, g: 120, b: 180 }).kind).toBe("custom");
  });

  it("detects white edge color while ignoring center", async () => {
    const image = await makeImage(64, 64, "white", "red");
    const result = await detectEdgeColorFromImage(image);
    expect(result.rgb.r).toBeGreaterThan(245);
    expect(result.rgb.g).toBeGreaterThan(245);
    expect(result.rgb.b).toBeGreaterThan(245);
    expect(result.classification.kind).toBe("white");
  });
});
