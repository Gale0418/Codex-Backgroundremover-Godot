import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export function planSheetLayout({ frameWidth, frameHeight, frameCount, maxSheetWidth, maxSheetHeight }) {
  const columns = Math.max(1, Math.min(frameCount, Math.floor(maxSheetWidth / frameWidth)));
  const rowsPerSheet = Math.max(1, Math.floor(maxSheetHeight / frameHeight));
  return {
    columns,
    rowsPerSheet,
    framesPerSheet: columns * rowsPerSheet
  };
}

async function readFrameSize(framePath) {
  const metadata = await sharp(framePath).metadata();
  return {
    width: metadata.width,
    height: metadata.height
  };
}

export async function createSpriteSheets({ framePaths, outputDir, fps, maxSheetWidth, maxSheetHeight }) {
  if (framePaths.length === 0) {
    throw new Error("No frames available for sprite sheet export.");
  }

  await fs.mkdir(outputDir, { recursive: true });
  const frameSize = await readFrameSize(framePaths[0]);
  const layout = planSheetLayout({
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
    frameCount: framePaths.length,
    maxSheetWidth,
    maxSheetHeight
  });

  const sheets = [];
  for (let start = 0; start < framePaths.length; start += layout.framesPerSheet) {
    const sheetIndex = sheets.length;
    const slice = framePaths.slice(start, start + layout.framesPerSheet);
    const rows = Math.ceil(slice.length / layout.columns);
    const width = layout.columns * frameSize.width;
    const height = rows * frameSize.height;
    const fileName = `sprite-sheet-${String(sheetIndex + 1).padStart(3, "0")}.png`;
    const sheetPath = path.join(outputDir, fileName);

    const composites = slice.map((framePath, localIndex) => ({
      input: framePath,
      left: (localIndex % layout.columns) * frameSize.width,
      top: Math.floor(localIndex / layout.columns) * frameSize.height
    }));

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(composites)
      .png()
      .toFile(sheetPath);

    sheets.push({
      file: fileName,
      firstFrame: start,
      frameCount: slice.length,
      columns: layout.columns,
      rows,
      width,
      height
    });
  }

  const metadata = {
    fps,
    frameCount: framePaths.length,
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
    sheets
  };
  await fs.writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  return { metadata, sheets };
}
