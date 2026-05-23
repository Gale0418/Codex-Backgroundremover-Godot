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
