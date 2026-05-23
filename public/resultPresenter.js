function formatRect(rect) {
  return `x:${rect.x} y:${rect.y} w:${rect.width} h:${rect.height}`;
}

export function summarizeMetadata(metadata) {
  return `${metadata.frameCount} frames · ${metadata.fps} fps · ${metadata.frameWidth}x${metadata.frameHeight} · padding ${metadata.padding}px · extrude ${metadata.extrude}px`;
}

export function resolveSheetUrls(result, jobId = "") {
  if (Array.isArray(result?.sheetUrls) && result.sheetUrls.length > 0) {
    return result.sheetUrls.map((sheet) => ({
      file: sheet.file,
      url: sheet.url
    }));
  }

  return (result?.metadata?.sheets || []).map((sheet) => ({
    file: sheet.file,
    url: `/exports/${jobId}/${sheet.file}`
  }));
}

export function buildFrameRows(metadata) {
  return (metadata?.frames || []).map((frame) => ({
    index: frame.index,
    sheet: frame.sheet,
    frameRect: formatRect(frame.frameRect),
    cellRect: formatRect(frame.cellRect)
  }));
}

export function buildAnimationPreviewModel(result, jobId = "") {
  const metadata = result?.metadata || {};
  const sheetUrlMap = new Map(resolveSheetUrls(result, jobId).map((sheet) => [sheet.file, sheet.url]));
  const fps = Math.max(1, Number(metadata.fps) || 1);
  const frames = (metadata.frames || [])
    .filter((frame) => sheetUrlMap.has(frame.sheet))
    .map((frame) => ({
      index: frame.index,
      sheet: frame.sheet,
      imageUrl: sheetUrlMap.get(frame.sheet),
      sourceRect: {
        x: frame.frameRect.x,
        y: frame.frameRect.y,
        width: frame.frameRect.width,
        height: frame.frameRect.height
      }
    }))
    .sort((a, b) => a.index - b.index);

  return {
    fps,
    frameDurationMs: 1000 / fps,
    width: metadata.frameWidth || frames[0]?.sourceRect.width || 1,
    height: metadata.frameHeight || frames[0]?.sourceRect.height || 1,
    frames
  };
}
