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
      maxSheetHeight: 256,
      padding: 0,
      extrude: 0
    });
    expect(layout.columns).toBe(4);
    expect(layout.rowsPerSheet).toBe(4);
    expect(layout.framesPerSheet).toBe(16);
  });

  it("accounts for padding and extruded cells in layout", () => {
    const layout = planSheetLayout({
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 10,
      maxSheetWidth: 256,
      maxSheetHeight: 256,
      padding: 2,
      extrude: 1
    });
    expect(layout.cellWidth).toBe(66);
    expect(layout.cellHeight).toBe(66);
    expect(layout.columns).toBe(3);
    expect(layout.rowsPerSheet).toBe(3);
    expect(layout.framesPerSheet).toBe(9);
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
      maxSheetWidth: 34,
      maxSheetHeight: 32,
      padding: 2,
      extrude: 1
    });

    expect(result.metadata.frameCount).toBe(3);
    expect(result.metadata.sheets[0].columns).toBe(3);
    expect(result.metadata.frameWidth).toBe(8);
    expect(result.metadata.frameHeight).toBe(8);
    expect(result.metadata.cellWidth).toBe(10);
    expect(result.metadata.cellHeight).toBe(10);
    expect(result.metadata.padding).toBe(2);
    expect(result.metadata.extrude).toBe(1);
    expect(result.metadata.sheets[0].width).toBe(34);
    expect(result.metadata.sheets[0].height).toBe(10);
    expect(result.metadata.frames[0]).toEqual({
      index: 0,
      sheet: "sprite-sheet-001.png",
      cellRect: { x: 0, y: 0, width: 10, height: 10 },
      frameRect: { x: 1, y: 1, width: 8, height: 8 }
    });
    expect(result.metadata.frames[1].frameRect).toEqual({ x: 13, y: 1, width: 8, height: 8 });
    await expect(fs.stat(path.join(dir, "metadata.json"))).resolves.toBeTruthy();
  });
});
