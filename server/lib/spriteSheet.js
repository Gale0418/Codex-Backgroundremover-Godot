import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function clampNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

export function planSheetLayout({
  frameWidth,
  frameHeight,
  frameCount,
  maxSheetWidth,
  maxSheetHeight,
  padding = 0,
  extrude = 0
}) {
  const safePadding = clampNonNegativeInteger(padding);
  const safeExtrude = clampNonNegativeInteger(extrude);
  const cellWidth = frameWidth + safeExtrude * 2;
  const cellHeight = frameHeight + safeExtrude * 2;
  const columns = Math.max(
    1,
    Math.min(frameCount, Math.floor((maxSheetWidth + safePadding) / (cellWidth + safePadding)))
  );
  const rowsPerSheet = Math.max(1, Math.floor((maxSheetHeight + safePadding) / (cellHeight + safePadding)));
  return {
    cellWidth,
    cellHeight,
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

export async function createSpriteSheets({
  framePaths,
  outputDir,
  fps,
  maxSheetWidth,
  maxSheetHeight,
  padding: requestedPadding = 0,
  extrude: requestedExtrude = 0
}) {
  if (framePaths.length === 0) {
    throw new Error("No frames available for sprite sheet export.");
  }

  await fs.mkdir(outputDir, { recursive: true });
  const frameSize = await readFrameSize(framePaths[0]);
  const padding = clampNonNegativeInteger(requestedPadding);
  const extrude = clampNonNegativeInteger(requestedExtrude);
  const layout = planSheetLayout({
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
    frameCount: framePaths.length,
    maxSheetWidth,
    maxSheetHeight,
    padding,
    extrude
  });

  const sheets = [];
  for (let start = 0; start < framePaths.length; start += layout.framesPerSheet) {
    const sheetIndex = sheets.length;
    const slice = framePaths.slice(start, start + layout.framesPerSheet);
    const rows = Math.ceil(slice.length / layout.columns);
    const width = layout.columns * layout.cellWidth + Math.max(0, layout.columns - 1) * padding;
    const height = rows * layout.cellHeight + Math.max(0, rows - 1) * padding;
    const fileName = `sprite-sheet-${String(sheetIndex + 1).padStart(3, "0")}.png`;
    const sheetPath = path.join(outputDir, fileName);

    const composites = await Promise.all(
      slice.map(async (framePath, localIndex) => {
        const col = localIndex % layout.columns;
        const row = Math.floor(localIndex / layout.columns);
        const input =
          extrude > 0
            ? await sharp(framePath)
                .ensureAlpha()
                .extend({
                  top: extrude,
                  bottom: extrude,
                  left: extrude,
                  right: extrude,
                  extendWith: "copy"
                })
                .png()
                .toBuffer()
            : framePath;
        return {
          input,
          left: col * (layout.cellWidth + padding),
          top: row * (layout.cellHeight + padding)
        };
      })
    );

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
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    padding,
    extrude,
    sheets
  };
  await fs.writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  return { metadata, sheets };
}
