import { config } from "../config.js";

export function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function isAcceptedVideoMimeType(mimeType) {
  return typeof mimeType === "string" && mimeType.startsWith("video/");
}

export function sanitizeExportSettings(body = {}) {
  return {
    tolerance: clampNumber(body.tolerance, config.defaults.tolerance, 0, 100),
    feather: clampNumber(body.feather, config.defaults.feather, 0, 64),
    despill: clampNumber(body.despill, config.defaults.despill, 0, 100),
    fps: clampNumber(body.fps, config.defaults.fps, 1, 30),
    scale: clampNumber(body.scale, config.defaults.scale, 1, 4),
    maxSheetWidth: clampNumber(body.maxSheetWidth, config.defaults.maxSheetWidth, 512, config.defaults.maxSheetWidth),
    maxSheetHeight: clampNumber(body.maxSheetHeight, config.defaults.maxSheetHeight, 512, config.defaults.maxSheetHeight),
    padding: clampNumber(body.padding, config.defaults.padding, 0, 32),
    extrude: clampNumber(body.extrude, config.defaults.extrude, 0, 8)
  };
}
