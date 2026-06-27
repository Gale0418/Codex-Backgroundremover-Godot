import { describe, expect, it } from "vitest";
import { clampNumber, isAcceptedVideoMimeType, sanitizeExportSettings } from "../server/lib/requestValidation.js";
import { config } from "../server/config.js";

describe("request validation", () => {
  it("clamps export settings to safe ranges", () => {
    const settings = sanitizeExportSettings({
      tolerance: 999,
      feather: -5,
      despill: "oops",
      fps: 999,
      scale: 99,
      maxSheetWidth: 999999,
      maxSheetHeight: 16,
      padding: 999,
      extrude: -3
    });

    expect(settings.tolerance).toBe(100);
    expect(settings.feather).toBe(0);
    expect(settings.despill).toBe(config.defaults.despill);
    expect(settings.fps).toBe(30);
    expect(settings.scale).toBe(4);
    expect(settings.maxSheetWidth).toBe(config.defaults.maxSheetWidth);
    expect(settings.maxSheetHeight).toBe(512);
    expect(settings.padding).toBe(32);
    expect(settings.extrude).toBe(0);
  });

  it("accepts only video mime types", () => {
    expect(isAcceptedVideoMimeType("video/mp4")).toBe(true);
    expect(isAcceptedVideoMimeType("text/plain")).toBe(false);
    expect(isAcceptedVideoMimeType("")).toBe(false);
  });

  it("clampNumber falls back when the value is not finite", () => {
    expect(clampNumber("NaN", 12, 1, 30)).toBe(12);
  });
});
