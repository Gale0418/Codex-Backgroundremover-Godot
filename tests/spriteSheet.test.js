import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createSpriteSheets, planSheetLayout } from "../server/lib/spriteSheet.js";

describe("sprite sheet", () => {
  it("plans columns and rows under maximum dimensions", () => {
    const layout = planSheetLayout({
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 10,
      maxSheetWidth: 256,
      maxSheetHeight: 256
    });
    expect(layout.columns).toBe(4);
    expect(layout.rowsPerSheet).toBe(4);
    expect(layout.framesPerSheet).toBe(16);
  });

  it("creates a sheet and metadata", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sheet-test-"));
    const framePaths = [];
    for (let index = 0; index < 3; index += 1) {
      const framePath = path.join(dir, `frame-${index}.png`);
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: index * 50, g: 0, b: 0, alpha: 1 }
        }
      })
        .png()
        .toFile(framePath);
      framePaths.push(framePath);
    }

    const result = await createSpriteSheets({
      framePaths,
      outputDir: dir,
      fps: 12,
      maxSheetWidth: 32,
      maxSheetHeight: 32
    });

    expect(result.metadata.frameCount).toBe(3);
    expect(result.metadata.sheets[0].columns).toBe(3);
    await expect(fs.stat(path.join(dir, "metadata.json"))).resolves.toBeTruthy();
  });
});
