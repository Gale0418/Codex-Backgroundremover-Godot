import { describe, expect, it } from "vitest";
import { assertFfmpegAvailable, parseProbeJson } from "../server/lib/ffmpeg.js";

describe("ffmpeg helpers", () => {
  it("detects local ffmpeg", async () => {
    const result = await assertFfmpegAvailable();
    expect(result.ffmpeg).toContain("ffmpeg");
    expect(result.ffprobe).toContain("ffprobe");
  });

  it("parses ffprobe video metadata", () => {
    const metadata = parseProbeJson({
      streams: [
        {
          codec_type: "video",
          width: 640,
          height: 360,
          r_frame_rate: "30/1",
          duration: "2.5"
        }
      ],
      format: { duration: "2.5" }
    });

    expect(metadata).toEqual({
      width: 640,
      height: 360,
      fps: 30,
      duration: 2.5
    });
  });
});
