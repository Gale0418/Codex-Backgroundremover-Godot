import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/index.js";
import { runProcess } from "../server/lib/ffmpeg.js";

async function createSyntheticVideo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bg-export-"));
  const videoPath = path.join(dir, "sample.mp4");
  await runProcess("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=48x48:d=1:r=4",
    "-vf",
    "drawbox=x=16:y=12:w=16:h=24:color=red:t=fill",
    videoPath
  ]);
  return videoPath;
}

async function upload(port, videoPath) {
  const form = new FormData();
  const bytes = await fs.readFile(videoPath);
  form.append("video", new Blob([bytes], { type: "video/mp4" }), "sample.mp4");
  const response = await fetch(`http://127.0.0.1:${port}/api/upload`, {
    method: "POST",
    body: form
  });
  return response.json();
}

async function waitForDone(port, jobId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs/${jobId}`);
    const body = await response.json();
    if (body.job.status === "done" || body.job.status === "failed") {
      return body.job;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Export did not finish in time.");
}

describe("export API", () => {
  it("exports keyed frames as sprite sheet metadata", async () => {
    const app = await createApp();
    const server = app.listen(0);
    const { port } = server.address();
    const videoPath = await createSyntheticVideo();

    try {
      const uploaded = await upload(port, videoPath);
      const exportResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/${uploaded.job.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "keying",
          backgroundColor: "#ffffff",
          tolerance: 20,
          feather: 0,
          despill: 0,
          fps: 4,
          scale: 1,
          maxSheetWidth: 512,
          maxSheetHeight: 512,
          padding: 2,
          extrude: 1
        })
      });
      expect(exportResponse.status).toBe(200);

      const done = await waitForDone(port, uploaded.job.id);
      expect(done.status).toBe("done");
      expect(done.result.metadata.frameCount).toBeGreaterThan(0);
      expect(done.result.metadata.sheets[0].file).toBe("sprite-sheet-001.png");
      expect(done.result.metadata.padding).toBe(2);
      expect(done.result.metadata.extrude).toBe(1);
      expect(done.result.metadata.cellWidth).toBe(done.result.metadata.frameWidth + 2);
      expect(done.result.metadata.frames[0].sheet).toBe("sprite-sheet-001.png");
      expect(done.result.metadata.frames[0].cellRect).toEqual({
        x: 0,
        y: 0,
        width: done.result.metadata.cellWidth,
        height: done.result.metadata.cellHeight
      });
      expect(done.result.metadata.frames[0].frameRect).toEqual({
        x: 1,
        y: 1,
        width: done.result.metadata.frameWidth,
        height: done.result.metadata.frameHeight
      });
      expect(done.result.sheetUrls[0]).toEqual({
        file: "sprite-sheet-001.png",
        url: `/exports/${uploaded.job.id}/sprite-sheet-001.png`
      });
      expect(done.result.downloadUrl).toContain(".zip");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
