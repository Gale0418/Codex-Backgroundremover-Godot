import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { keyFrameBuffer } from "../server/lib/keying.js";

describe("keying", () => {
  it("turns matching background pixels transparent and keeps subject opaque", async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        {
          input: Buffer.from([255, 0, 0, 255]),
          raw: { width: 1, height: 1, channels: 4 },
          left: 1,
          top: 0
        }
      ])
      .png()
      .toBuffer();

    const output = await keyFrameBuffer(input, {
      backgroundColor: { r: 255, g: 255, b: 255 },
      tolerance: 20,
      feather: 0,
      despill: 0
    });
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
  });
});
