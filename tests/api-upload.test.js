import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/index.js";
import { runProcess } from "../server/lib/ffmpeg.js";

async function createSyntheticVideo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bg-upload-"));
  const videoPath = path.join(dir, "sample.mp4");
  await runProcess("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=32x32:d=1:r=4",
    "-vf",
    "drawbox=x=8:y=8:w=16:h=16:color=red:t=fill",
    videoPath
  ]);
  return videoPath;
}

describe("upload API", () => {
  it("stores uploaded video and returns metadata", async () => {
    const app = await createApp();
    const server = app.listen(0);
    const { port } = server.address();
    const videoPath = await createSyntheticVideo();

    try {
      const form = new FormData();
      const bytes = await fs.readFile(videoPath);
      form.append("video", new Blob([bytes], { type: "video/mp4" }), "sample.mp4");

      const response = await fetch(`http://127.0.0.1:${port}/api/upload`, {
        method: "POST",
        body: form
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.job.id).toMatch(/[0-9a-f-]{36}/);
      expect(body.metadata.width).toBe(32);
      expect(body.metadata.height).toBe(32);
      expect(body.metadata.duration).toBeGreaterThan(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
