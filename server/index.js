import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getAiMattingStatus } from "./lib/aiMatting.js";
import { detectEdgeColorFromImage } from "./lib/backgroundDetector.js";
import { assertFfmpegAvailable, extractFrames, extractSampleFrame, probeVideo } from "./lib/ffmpeg.js";
import { hexToRgb, keyFrameFile } from "./lib/keying.js";
import { createUploadJob, getJob, publicJob, updateJob } from "./lib/jobs.js";
import { createSpriteSheets } from "./lib/spriteSheet.js";
import { isAcceptedVideoMimeType, sanitizeExportSettings } from "./lib/requestValidation.js";

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!isAcceptedVideoMimeType(file?.mimetype)) {
      callback(new Error("Only video files allowed."));
      return;
    }
    callback(null, true);
  }
});

function uploadSingleVideo(req, res, next) {
  upload.single("video")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: error.message || "Upload failed." });
  });
}

export function isDirectRun(moduleUrl, argvPath) {
  if (!argvPath) return false;
  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argvPath);
}

async function zipDirectory(sourceDir, outputPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export async function createApp({ assertTools = assertFfmpegAvailable } = {}) {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.mkdir(config.exportDir, { recursive: true });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(config.publicDir));
  app.use("/exports", express.static(config.exportDir));

  app.get("/api/health", async (_req, res) => {
    try {
      const tools = await assertTools();
      res.json({
        ok: true,
        app: "godot-video-background-remover",
        tools: {
          available: true,
          ...tools
        }
      });
    } catch (error) {
      res.json({
        ok: true,
        app: "godot-video-background-remover",
        tools: {
          available: false,
          error: error.message
        }
      });
    }
  });

  app.post("/api/upload", uploadSingleVideo, async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No video file uploaded." });
        return;
      }
      const job = await createUploadJob(req.file);
      const metadata = await probeVideo(job.inputPath);
      res.json({ job: publicJob(job), metadata });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    res.json({ job: publicJob(job) });
  });

  app.post("/api/jobs/:id/detect-background", async (req, res) => {
    try {
      const job = getJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found." });
        return;
      }
      const samplePath = path.join(job.sampleDir, "sample-000.png");
      await extractSampleFrame(job.inputPath, samplePath, 0);
      const buffer = fsSync.readFileSync(samplePath);
      const detection = await detectEdgeColorFromImage(buffer);
      res.json({ detection });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jobs/:id/export", async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    const settings = {
      mode: req.body.mode || "keying",
      backgroundColor: hexToRgb(req.body.backgroundColor || "#ffffff"),
      ...sanitizeExportSettings(req.body)
    };

    if (settings.mode === "ai") {
      res.status(501).json({
        error: "髮絲 AI 模式需要額外依賴，MVP 先提供快速 keying 匯出。"
      });
      return;
    }

    updateJob(job.id, { status: "exporting", progress: 10, error: null });
    res.json({ job: publicJob(getJob(job.id)) });

    queueMicrotask(async () => {
      try {
        await fs.rm(job.framesDir, { recursive: true, force: true });
        await fs.mkdir(job.framesDir, { recursive: true });
        await fs.rm(job.outputDir, { recursive: true, force: true });
        await fs.mkdir(job.outputDir, { recursive: true });

        const rawPattern = path.join(job.framesDir, "raw-%06d.png");
        await extractFrames(job.inputPath, rawPattern, settings);
        updateJob(job.id, { progress: 35 });

        const rawFrames = (await fs.readdir(job.framesDir))
          .filter((name) => name.startsWith("raw-") && name.endsWith(".png"))
          .sort()
          .map((name) => path.join(job.framesDir, name));

        const keyedDir = path.join(job.outputDir, "frames");
        await fs.mkdir(keyedDir, { recursive: true });
        const keyedFrames = [];
        for (let index = 0; index < rawFrames.length; index += 1) {
          const outputPath = path.join(keyedDir, `frame-${String(index).padStart(6, "0")}.png`);
          await keyFrameFile(rawFrames[index], outputPath, settings);
          keyedFrames.push(outputPath);
        }
        updateJob(job.id, { progress: 70 });

        const { metadata } = await createSpriteSheets({
          framePaths: keyedFrames,
          outputDir: job.outputDir,
          fps: settings.fps,
          maxSheetWidth: settings.maxSheetWidth,
          maxSheetHeight: settings.maxSheetHeight,
          padding: settings.padding,
          extrude: settings.extrude
        });
        const zipPath = path.join(config.exportDir, `${job.id}.zip`);
        await zipDirectory(job.outputDir, zipPath);
        updateJob(job.id, {
          status: "done",
          progress: 100,
          result: {
            metadata,
            sheetUrls: metadata.sheets.map((sheet) => ({
              file: sheet.file,
              url: `/exports/${job.id}/${sheet.file}`
            })),
            downloadUrl: `/exports/${job.id}.zip`
          }
        });
      } catch (error) {
        updateJob(job.id, { status: "failed", error: error.message });
      }
    });
  });

  app.get("/api/ai/status", async (_req, res) => {
    res.json(await getAiMattingStatus());
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "index.html"));
  });

  return app;
}

if (process.argv.includes("--smoke")) {
  const app = await createApp();
  const server = app.listen(0, () => {
    const address = server.address();
    console.log(`smoke server listening on ${address.port}`);
    server.close();
  });
} else if (isDirectRun(import.meta.url, process.argv[1])) {
  const app = await createApp();
  app.listen(config.port, () => {
    console.log(`Local tool running at http://localhost:${config.port}`);
  });
}
