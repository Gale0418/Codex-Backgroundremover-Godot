# Godot Video Background Remover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Web MVP that converts a short video into Godot-friendly transparent Sprite Sheet PNG files plus metadata JSON.

**Architecture:** A Node/Express backend owns upload, ffmpeg probing/extraction, image processing, export jobs, and static serving. A lightweight frontend calls backend APIs, shows detected background color and export controls, and downloads the finished output. The AI hair-detail mode is exposed as an experimental mode stub in MVP so the fast keying path remains shippable without heavy Python dependencies.

**Tech Stack:** Node.js 24, Express, Multer, Sharp, ffmpeg/ffprobe CLI, Vitest, vanilla HTML/CSS/JS.

---

## File Structure

- `package.json`: npm scripts, dependencies, and project metadata.
- `server/index.js`: Express app, API routes, static frontend serving, job orchestration.
- `server/config.js`: paths, defaults, and runtime constants.
- `server/lib/ffmpeg.js`: ffmpeg/ffprobe wrappers with clear error messages.
- `server/lib/backgroundDetector.js`: detect likely background color from sampled edge pixels.
- `server/lib/keying.js`: convert frames to transparent PNGs using tolerance, feather, and despill settings.
- `server/lib/spriteSheet.js`: pack transparent frames into one or more Sprite Sheet PNGs and write metadata JSON.
- `server/lib/jobs.js`: upload/export workspace creation, job status tracking, cleanup helpers.
- `server/lib/aiMatting.js`: experimental capability probe and explicit "not installed" response for MVP.
- `public/index.html`: single-screen tool UI.
- `public/styles.css`: responsive app layout and controls.
- `public/app.js`: upload, detection, export, polling, and download interactions.
- `tests/backgroundDetector.test.js`: unit tests for edge color detection.
- `tests/spriteSheet.test.js`: unit tests for sheet layout and metadata.
- `tests/keying.test.js`: unit tests for alpha generation on synthetic pixels.
- `tests/api-smoke.test.js`: backend health/capability smoke tests.
- `README.md`: local run instructions, Godot import notes, and mode limitations.

## Task 1: Project Skeleton And Dependencies

**Files:**
- Create: `package.json`
- Create: `server/config.js`
- Create: `server/index.js`
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `tests/api-smoke.test.js`

- [ ] **Step 1: Create npm package metadata**

Create `package.json`:

```json
{
  "name": "godot-video-background-remover",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Local video background remover that exports Godot-friendly transparent sprite sheets.",
  "scripts": {
    "dev": "node server/index.js",
    "start": "node server/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke": "node server/index.js --smoke"
  },
  "dependencies": {
    "archiver": "^7.0.1",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.5",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create runtime config**

Create `server/config.js`:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  rootDir,
  publicDir: path.join(rootDir, "public"),
  workspaceDir: path.join(rootDir, ".work"),
  uploadDir: path.join(rootDir, ".work", "uploads"),
  exportDir: path.join(rootDir, ".work", "exports"),
  port: Number(process.env.PORT || 5177),
  defaults: {
    fps: 12,
    tolerance: 42,
    feather: 8,
    despill: 25,
    scale: 1,
    maxSheetWidth: 4096,
    maxSheetHeight: 4096,
    debugFrames: false
  }
};
```

- [ ] **Step 3: Create minimal Express app**

Create `server/index.js`:

```js
import express from "express";
import fs from "node:fs/promises";
import { config } from "./config.js";

export async function createApp() {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.mkdir(config.exportDir, { recursive: true });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(config.publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "godot-video-background-remover" });
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
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  app.listen(config.port, () => {
    console.log(`Local tool running at http://localhost:${config.port}`);
  });
}
```

- [ ] **Step 4: Create placeholder frontend**

Create `public/index.html`:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Godot 透明 Sprite Sheet 產生器</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="app-shell">
      <section class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Local Sprite Sheet Tool</p>
            <h1>Godot 透明 Sprite Sheet 產生器</h1>
          </div>
          <span id="healthStatus" class="status-pill">檢查中</span>
        </header>
        <section class="panel">
          <label class="dropzone" for="videoFile">
            <input id="videoFile" type="file" accept="video/*" />
            <span>選擇影片</span>
            <small>支援短影片，第一版建議 3-8 秒。</small>
          </label>
        </section>
      </section>
    </main>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

Create `public/styles.css`:

```css
:root {
  color-scheme: dark;
  font-family: "Segoe UI", "Noto Sans TC", system-ui, sans-serif;
  background: #151718;
  color: #f4f1e8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #151718;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.workspace {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #9fd8cb;
  font-size: 0.82rem;
}

h1 {
  margin: 0;
  font-size: 1.8rem;
  letter-spacing: 0;
}

.status-pill {
  padding: 8px 12px;
  border: 1px solid #405052;
  border-radius: 999px;
  color: #dce8df;
  white-space: nowrap;
}

.panel {
  border: 1px solid #30383a;
  border-radius: 8px;
  padding: 18px;
  background: #1f2324;
}

.dropzone {
  display: grid;
  gap: 8px;
  min-height: 180px;
  place-items: center;
  border: 1px dashed #607173;
  border-radius: 8px;
  cursor: pointer;
}

.dropzone input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
}

.dropzone span {
  font-size: 1.15rem;
  font-weight: 700;
}

.dropzone small {
  color: #b9c7c0;
}
```

Create `public/app.js`:

```js
const healthStatus = document.querySelector("#healthStatus");

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    healthStatus.textContent = result.ok ? "本機服務正常" : "服務異常";
  } catch {
    healthStatus.textContent = "連線失敗";
  }
}

checkHealth();
```

- [ ] **Step 5: Create API smoke test**

Create `tests/api-smoke.test.js`:

```js
import { describe, expect, it } from "vitest";
import { createApp } from "../server/index.js";

describe("API smoke", () => {
  it("returns health status", async () => {
    const app = await createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await response.json();
      expect(body).toEqual({ ok: true, app: "godot-video-background-remover" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 7: Run skeleton test**

Run: `npm test`

Expected: `tests/api-smoke.test.js` passes.

## Task 2: ffmpeg Wrappers And Upload API

**Files:**
- Create: `server/lib/ffmpeg.js`
- Create: `server/lib/jobs.js`
- Modify: `server/index.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Create: `tests/ffmpeg.test.js`

- [ ] **Step 1: Write ffmpeg capability tests**

Create `tests/ffmpeg.test.js`:

```js
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
```

- [ ] **Step 2: Implement ffmpeg wrapper**

Create `server/lib/ffmpeg.js`:

```js
import { spawn } from "node:child_process";

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
      }
    });
  });
}

export async function assertFfmpegAvailable() {
  const ffmpeg = await runProcess("ffmpeg", ["-version"]);
  const ffprobe = await runProcess("ffprobe", ["-version"]);
  return {
    ffmpeg: ffmpeg.stdout.split("\n")[0],
    ffprobe: ffprobe.stdout.split("\n")[0]
  };
}

function parseRate(rate) {
  const [left, right] = String(rate || "0/1").split("/").map(Number);
  if (!left || !right) return 0;
  return Number((left / right).toFixed(3));
}

export function parseProbeJson(raw) {
  const video = raw.streams?.find((stream) => stream.codec_type === "video");
  if (!video) {
    throw new Error("No video stream found.");
  }
  return {
    width: Number(video.width),
    height: Number(video.height),
    fps: parseRate(video.r_frame_rate),
    duration: Number(video.duration || raw.format?.duration || 0)
  };
}

export async function probeVideo(filePath) {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);
  return parseProbeJson(JSON.parse(stdout));
}

export async function extractFrames(inputPath, outputPattern, options) {
  const filters = [`fps=${options.fps}`];
  if (options.scale && options.scale !== 1) {
    filters.push(`scale=iw*${options.scale}:ih*${options.scale}`);
  }
  await runProcess("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    filters.join(","),
    "-start_number",
    "0",
    outputPattern
  ]);
}

export async function extractSampleFrame(inputPath, outputPath, timestampSeconds) {
  await runProcess("ffmpeg", [
    "-y",
    "-ss",
    String(timestampSeconds),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    outputPath
  ]);
}
```

- [ ] **Step 3: Implement job workspace helpers**

Create `server/lib/jobs.js`:

```js
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";

const jobs = new Map();

export async function createUploadJob(file) {
  const id = uuidv4();
  const jobDir = path.join(config.workspaceDir, id);
  const inputPath = path.join(jobDir, "input");
  const sampleDir = path.join(jobDir, "samples");
  const framesDir = path.join(jobDir, "frames");
  const outputDir = path.join(config.exportDir, id);

  await fs.mkdir(jobDir, { recursive: true });
  await fs.mkdir(sampleDir, { recursive: true });
  await fs.mkdir(framesDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.rename(file.path, inputPath);

  const job = {
    id,
    inputPath,
    originalName: file.originalname,
    sampleDir,
    framesDir,
    outputDir,
    status: "uploaded",
    progress: 0,
    result: null,
    error: null
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

export function updateJob(id, patch) {
  const current = jobs.get(id);
  if (!current) return null;
  const updated = { ...current, ...patch };
  jobs.set(id, updated);
  return updated;
}

export function publicJob(job) {
  return {
    id: job.id,
    originalName: job.originalName,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error
  };
}
```

- [ ] **Step 4: Add upload routes**

Modify `server/index.js` so it includes upload and capability routes:

```js
import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import { config } from "./config.js";
import { assertFfmpegAvailable, probeVideo } from "./lib/ffmpeg.js";
import { createUploadJob, getJob, publicJob } from "./lib/jobs.js";

const upload = multer({ dest: config.uploadDir });

export async function createApp() {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.mkdir(config.exportDir, { recursive: true });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(config.publicDir));
  app.use("/exports", express.static(config.exportDir));

  app.get("/api/health", async (_req, res) => {
    try {
      const tools = await assertFfmpegAvailable();
      res.json({ ok: true, app: "godot-video-background-remover", tools });
    } catch (error) {
      res.status(503).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/upload", upload.single("video"), async (req, res) => {
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
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  app.listen(config.port, () => {
    console.log(`Local tool running at http://localhost:${config.port}`);
  });
}
```

- [ ] **Step 5: Expand frontend upload UI**

Modify `public/index.html` by adding status output inside `.panel`:

```html
<div class="file-summary">
  <strong id="fileName">尚未選擇影片</strong>
  <span id="videoMeta">等待上傳</span>
</div>
<pre id="logOutput" class="log-output">準備好了。</pre>
```

Modify `public/app.js`:

```js
const healthStatus = document.querySelector("#healthStatus");
const videoFile = document.querySelector("#videoFile");
const fileName = document.querySelector("#fileName");
const videoMeta = document.querySelector("#videoMeta");
const logOutput = document.querySelector("#logOutput");

let currentJobId = null;

function log(message) {
  logOutput.textContent = message;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    healthStatus.textContent = result.ok ? "本機服務正常" : "服務異常";
  } catch {
    healthStatus.textContent = "連線失敗";
  }
}

async function uploadVideo(file) {
  const formData = new FormData();
  formData.append("video", file);
  log("上傳並讀取影片中...");
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Upload failed.");
  }
  currentJobId = result.job.id;
  fileName.textContent = file.name;
  videoMeta.textContent = `${result.metadata.width}x${result.metadata.height} · ${result.metadata.fps} fps · ${result.metadata.duration.toFixed(2)} 秒`;
  log("影片已讀取，下一步會自動偵測背景色。");
}

videoFile.addEventListener("change", async () => {
  const file = videoFile.files?.[0];
  if (!file) return;
  try {
    await uploadVideo(file);
  } catch (error) {
    log(error.message);
  }
});

checkHealth();
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: API and ffmpeg tests pass.

## Task 3: Background Detection

**Files:**
- Create: `server/lib/backgroundDetector.js`
- Modify: `server/index.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Create: `tests/backgroundDetector.test.js`

- [ ] **Step 1: Write detection tests**

Create `tests/backgroundDetector.test.js`:

```js
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { classifyBackground, detectEdgeColorFromImage } from "../server/lib/backgroundDetector.js";

async function makeImage(width, height, background, center) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${background}" />
      <rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="${center}" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("background detection", () => {
  it("classifies common key colors", () => {
    expect(classifyBackground({ r: 252, g: 252, b: 248 }).kind).toBe("white");
    expect(classifyBackground({ r: 4, g: 5, b: 6 }).kind).toBe("black");
    expect(classifyBackground({ r: 10, g: 240, b: 30 }).kind).toBe("green");
    expect(classifyBackground({ r: 80, g: 120, b: 180 }).kind).toBe("custom");
  });

  it("detects white edge color while ignoring center", async () => {
    const image = await makeImage(64, 64, "white", "red");
    const result = await detectEdgeColorFromImage(image);
    expect(result.rgb.r).toBeGreaterThan(245);
    expect(result.rgb.g).toBeGreaterThan(245);
    expect(result.rgb.b).toBeGreaterThan(245);
    expect(result.classification.kind).toBe("white");
  });
});
```

- [ ] **Step 2: Implement background detector**

Create `server/lib/backgroundDetector.js`:

```js
import sharp from "sharp";

function distance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function classifyBackground(rgb) {
  const presets = [
    { kind: "white", rgb: { r: 255, g: 255, b: 255 } },
    { kind: "black", rgb: { r: 0, g: 0, b: 0 } },
    { kind: "green", rgb: { r: 0, g: 255, b: 0 } }
  ];
  const best = presets
    .map((preset) => ({ ...preset, distance: distance(rgb, preset.rgb) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (best.distance <= 80) return best;
  return { kind: "custom", rgb, distance: best.distance };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export async function detectEdgeColorFromImage(imageBuffer) {
  const image = sharp(imageBuffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const edge = Math.max(2, Math.round(Math.min(info.width, info.height) * 0.08));
  const pixels = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const isEdge = x < edge || y < edge || x >= info.width - edge || y >= info.height - edge;
      if (!isEdge) continue;
      const offset = (y * info.width + x) * info.channels;
      pixels.push({
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2]
      });
    }
  }

  const rgb = {
    r: Math.round(median(pixels.map((pixel) => pixel.r))),
    g: Math.round(median(pixels.map((pixel) => pixel.g))),
    b: Math.round(median(pixels.map((pixel) => pixel.b)))
  };
  return {
    rgb,
    hex: `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
    classification: classifyBackground(rgb)
  };
}
```

- [ ] **Step 3: Add detection API**

Modify `server/index.js` imports:

```js
import path from "node:path";
import fsSync from "node:fs";
import { detectEdgeColorFromImage } from "./lib/backgroundDetector.js";
import { extractSampleFrame } from "./lib/ffmpeg.js";
```

Add route inside `createApp()`:

```js
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
```

- [ ] **Step 4: Add detection controls to frontend**

Modify `public/index.html` after `.file-summary`:

```html
<div class="controls-grid">
  <label>
    背景色
    <input id="backgroundColor" type="color" value="#ffffff" />
  </label>
  <label>
    模式
    <select id="mode">
      <option value="keying">快速 keying</option>
      <option value="ai">髮絲 AI Experimental</option>
    </select>
  </label>
</div>
```

Modify `public/styles.css`:

```css
.file-summary,
.controls-grid {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.controls-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.controls-grid label {
  display: grid;
  gap: 8px;
  color: #d9e3dc;
}

input[type="color"],
select {
  width: 100%;
  min-height: 40px;
  border: 1px solid #405052;
  border-radius: 6px;
  background: #171a1b;
  color: #f4f1e8;
}

.log-output {
  margin-top: 16px;
  min-height: 72px;
  padding: 12px;
  border: 1px solid #30383a;
  border-radius: 8px;
  overflow: auto;
  background: #121515;
  color: #c8d7cf;
  white-space: pre-wrap;
}
```

Modify `public/app.js`:

```js
const backgroundColor = document.querySelector("#backgroundColor");

async function detectBackground() {
  const response = await fetch(`/api/jobs/${currentJobId}/detect-background`, {
    method: "POST"
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Background detection failed.");
  }
  backgroundColor.value = result.detection.hex;
  log(`偵測背景色：${result.detection.hex} (${result.detection.classification.kind})`);
}
```

Update `uploadVideo(file)` tail:

```js
  log("影片已讀取，正在偵測背景色...");
  await detectBackground();
```

- [ ] **Step 5: Run detection tests**

Run: `npm test -- tests/backgroundDetector.test.js`

Expected: detector tests pass.

## Task 4: Keying Pipeline

**Files:**
- Create: `server/lib/keying.js`
- Modify: `server/index.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Create: `tests/keying.test.js`

- [ ] **Step 1: Write keying tests**

Create `tests/keying.test.js`:

```js
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { keyFrameBuffer } from "../server/lib/keying.js";

describe("keying", () => {
  it("turns matching background pixels transparent and keeps subject opaque", async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        {
          input: Buffer.from([255, 0, 0, 255]),
          raw: { width: 1, height: 1, channels: 4 },
          left: 1,
          top: 0
        }
      ])
      .png()
      .toBuffer();

    const output = await keyFrameBuffer(input, {
      backgroundColor: { r: 255, g: 255, b: 255 },
      tolerance: 20,
      feather: 0,
      despill: 0
    });
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
  });
});
```

- [ ] **Step 2: Implement keying**

Create `server/lib/keying.js`:

```js
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function colorDistance(r, g, b, target) {
  return Math.sqrt((r - target.r) ** 2 + (g - target.g) ** 2 + (b - target.b) ** 2);
}

export function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

export async function keyFrameBuffer(inputBuffer, settings) {
  const image = sharp(inputBuffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const tolerance = Number(settings.tolerance);
  const feather = Number(settings.feather);
  const softRange = Math.max(1, feather);

  for (let index = 0; index < output.length; index += info.channels) {
    const r = output[index];
    const g = output[index + 1];
    const b = output[index + 2];
    const distance = colorDistance(r, g, b, settings.backgroundColor);

    let alpha = 255;
    if (distance <= tolerance) {
      alpha = 0;
    } else if (distance <= tolerance + softRange) {
      alpha = Math.round(((distance - tolerance) / softRange) * 255);
    }

    if (settings.despill > 0 && settings.backgroundColor.g > settings.backgroundColor.r + 60) {
      const reduction = settings.despill / 100;
      output[index + 1] = Math.max(0, Math.round(g - Math.max(0, g - Math.max(r, b)) * reduction));
    }
    output[index + 3] = Math.min(output[index + 3], alpha);
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels
    }
  })
    .png()
    .toBuffer();
}

export async function keyFrameFile(inputPath, outputPath, settings) {
  const input = await fs.readFile(inputPath);
  const output = await keyFrameBuffer(input, settings);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output);
}
```

- [ ] **Step 3: Add export settings UI**

Modify `public/index.html` inside `.controls-grid`:

```html
<label>
  Tolerance
  <input id="tolerance" type="range" min="0" max="160" value="42" />
</label>
<label>
  Feather
  <input id="feather" type="range" min="0" max="80" value="8" />
</label>
<label>
  Despill
  <input id="despill" type="range" min="0" max="100" value="25" />
</label>
<label>
  FPS
  <input id="fps" type="number" min="1" max="30" value="12" />
</label>
<label>
  縮放
  <input id="scale" type="number" min="0.1" max="1" step="0.1" value="1" />
</label>
<label>
  Sheet 最大寬
  <input id="maxSheetWidth" type="number" min="512" max="8192" step="512" value="4096" />
</label>
```

Modify `public/styles.css`:

```css
input[type="range"],
input[type="number"] {
  width: 100%;
}

input[type="number"] {
  min-height: 40px;
  border: 1px solid #405052;
  border-radius: 6px;
  padding: 0 10px;
  background: #171a1b;
  color: #f4f1e8;
}
```

- [ ] **Step 4: Run keying test**

Run: `npm test -- tests/keying.test.js`

Expected: keying test passes.

## Task 5: Sprite Sheet Export

**Files:**
- Create: `server/lib/spriteSheet.js`
- Modify: `server/index.js`
- Modify: `server/lib/ffmpeg.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Create: `tests/spriteSheet.test.js`

- [ ] **Step 1: Write sprite sheet tests**

Create `tests/spriteSheet.test.js`:

```js
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createSpriteSheets, planSheetLayout } from "../server/lib/spriteSheet.js";

describe("sprite sheet", () => {
  it("plans columns and rows under maximum dimensions", () => {
    const layout = planSheetLayout({
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 10,
      maxSheetWidth: 256,
      maxSheetHeight: 256
    });
    expect(layout.columns).toBe(4);
    expect(layout.rowsPerSheet).toBe(4);
    expect(layout.framesPerSheet).toBe(16);
  });

  it("creates a sheet and metadata", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sheet-test-"));
    const framePaths = [];
    for (let index = 0; index < 3; index += 1) {
      const framePath = path.join(dir, `frame-${index}.png`);
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: index * 50, g: 0, b: 0, alpha: 1 }
        }
      }).png().toFile(framePath);
      framePaths.push(framePath);
    }

    const result = await createSpriteSheets({
      framePaths,
      outputDir: dir,
      fps: 12,
      maxSheetWidth: 32,
      maxSheetHeight: 32
    });

    expect(result.metadata.frameCount).toBe(3);
    expect(result.metadata.sheets[0].columns).toBe(3);
    await expect(fs.stat(path.join(dir, "metadata.json"))).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement sprite sheet generator**

Create `server/lib/spriteSheet.js`:

```js
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
```

- [ ] **Step 3: Implement export route**

Modify `server/index.js` imports:

```js
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { hexToRgb, keyFrameFile } from "./lib/keying.js";
import { createSpriteSheets } from "./lib/spriteSheet.js";
import { updateJob } from "./lib/jobs.js";
```

Add helper in `server/index.js`:

```js
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
```

Add export route:

```js
app.post("/api/jobs/:id/export", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  const settings = {
    mode: req.body.mode || "keying",
    backgroundColor: hexToRgb(req.body.backgroundColor || "#ffffff"),
    tolerance: Number(req.body.tolerance || config.defaults.tolerance),
    feather: Number(req.body.feather || config.defaults.feather),
    despill: Number(req.body.despill || config.defaults.despill),
    fps: Number(req.body.fps || config.defaults.fps),
    scale: Number(req.body.scale || config.defaults.scale),
    maxSheetWidth: Number(req.body.maxSheetWidth || config.defaults.maxSheetWidth),
    maxSheetHeight: Number(req.body.maxSheetHeight || config.defaults.maxSheetHeight)
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
        maxSheetHeight: settings.maxSheetHeight
      });
      const zipPath = path.join(job.outputDir, "godot-sprite-sheet-export.zip");
      await zipDirectory(job.outputDir, zipPath);
      updateJob(job.id, {
        status: "done",
        progress: 100,
        result: {
          metadata,
          downloadUrl: `/exports/${job.id}/godot-sprite-sheet-export.zip`
        }
      });
    } catch (error) {
      updateJob(job.id, { status: "failed", error: error.message });
    }
  });
});
```

- [ ] **Step 4: Add export button and polling**

Modify `public/index.html` after `.controls-grid`:

```html
<button id="exportButton" class="primary-action" type="button" disabled>匯出 Sprite Sheet</button>
<a id="downloadLink" class="download-link" hidden>下載結果</a>
```

Modify `public/styles.css`:

```css
.primary-action,
.download-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 16px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: #9fd8cb;
  color: #10201c;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.download-link {
  margin-left: 10px;
  background: #e7c46b;
}
```

Modify `public/app.js`:

```js
const mode = document.querySelector("#mode");
const tolerance = document.querySelector("#tolerance");
const feather = document.querySelector("#feather");
const despill = document.querySelector("#despill");
const fps = document.querySelector("#fps");
const scale = document.querySelector("#scale");
const maxSheetWidth = document.querySelector("#maxSheetWidth");
const exportButton = document.querySelector("#exportButton");
const downloadLink = document.querySelector("#downloadLink");

function exportSettings() {
  return {
    mode: mode.value,
    backgroundColor: backgroundColor.value,
    tolerance: Number(tolerance.value),
    feather: Number(feather.value),
    despill: Number(despill.value),
    fps: Number(fps.value),
    scale: Number(scale.value),
    maxSheetWidth: Number(maxSheetWidth.value),
    maxSheetHeight: 4096
  };
}

async function pollJob() {
  const response = await fetch(`/api/jobs/${currentJobId}`);
  const result = await response.json();
  const job = result.job;
  log(`狀態：${job.status} · ${job.progress}%`);
  if (job.status === "done") {
    downloadLink.hidden = false;
    downloadLink.href = job.result.downloadUrl;
    downloadLink.download = "godot-sprite-sheet-export.zip";
    downloadLink.textContent = "下載結果";
    exportButton.disabled = false;
    return;
  }
  if (job.status === "failed") {
    log(job.error || "匯出失敗");
    exportButton.disabled = false;
    return;
  }
  window.setTimeout(pollJob, 1000);
}

exportButton.addEventListener("click", async () => {
  if (!currentJobId) return;
  exportButton.disabled = true;
  downloadLink.hidden = true;
  const response = await fetch(`/api/jobs/${currentJobId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportSettings())
  });
  const result = await response.json();
  if (!response.ok) {
    log(result.error || "匯出失敗");
    exportButton.disabled = false;
    return;
  }
  await pollJob();
});
```

Update `detectBackground()` success tail:

```js
  exportButton.disabled = false;
```

- [ ] **Step 5: Run sprite sheet tests**

Run: `npm test -- tests/spriteSheet.test.js`

Expected: sheet tests pass.

## Task 6: AI Matting Experimental Stub

**Files:**
- Create: `server/lib/aiMatting.js`
- Modify: `server/index.js`
- Modify: `public/app.js`
- Modify: `README.md`
- Create: `tests/aiMatting.test.js`

- [ ] **Step 1: Write AI availability test**

Create `tests/aiMatting.test.js`:

```js
import { describe, expect, it } from "vitest";
import { getAiMattingStatus } from "../server/lib/aiMatting.js";

describe("AI matting status", () => {
  it("returns explicit experimental status", async () => {
    const status = await getAiMattingStatus();
    expect(status.mode).toBe("experimental");
    expect(status.available).toBe(false);
    expect(status.message).toContain("快速 keying");
  });
});
```

- [ ] **Step 2: Implement AI status module**

Create `server/lib/aiMatting.js`:

```js
export async function getAiMattingStatus() {
  return {
    mode: "experimental",
    available: false,
    message: "髮絲 AI 模式尚未安裝模型依賴；目前請使用快速 keying 匯出。"
  };
}
```

- [ ] **Step 3: Add AI status route**

Modify `server/index.js` imports:

```js
import { getAiMattingStatus } from "./lib/aiMatting.js";
```

Add route:

```js
app.get("/api/ai/status", async (_req, res) => {
  res.json(await getAiMattingStatus());
});
```

- [ ] **Step 4: Warn users when selecting AI mode**

Modify `public/app.js`:

```js
mode.addEventListener("change", async () => {
  if (mode.value !== "ai") return;
  const response = await fetch("/api/ai/status");
  const status = await response.json();
  if (!status.available) {
    log(status.message);
  }
});
```

- [ ] **Step 5: Document AI mode**

Create `README.md`:

```md
# Godot 透明 Sprite Sheet 影片去背工具

本工具在本機執行，將短影片轉成 Godot 可用的透明 Sprite Sheet PNG 與 metadata JSON。

## 執行

```powershell
npm install
npm run dev
```

開啟 `http://localhost:5177`。

## 第一版支援

- 自動偵測影片邊緣背景色。
- 快速純色 keying。
- 輸出透明 Sprite Sheet PNG。
- 輸出 metadata JSON。

## 髮絲 AI 模式

髮絲 AI 模式是 Experimental。MVP 先保留介面與能力偵測，模型依賴尚未內建。快速 keying 是第一版保底路線。

## Godot 使用方式

將輸出的 `sprite-sheet-001.png` 匯入 Godot。依 `metadata.json` 的 `frameWidth`、`frameHeight`、`fps`、`columns` 建立動畫格。
```

- [ ] **Step 6: Run AI status test**

Run: `npm test -- tests/aiMatting.test.js`

Expected: AI status test passes.

## Task 7: End-To-End Verification And Mission Center Update

**Files:**
- Modify: `MissionCenter/tasks.md`
- Modify: `MissionCenter/progress.md`
- Modify: `MissionCenter/smoke-tests.md`
- Modify: `MissionCenter/snapshot.md`

- [ ] **Step 1: Run full unit test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Start dev server**

Run: `npm run dev`

Expected: console prints `Local tool running at http://localhost:5177`.

- [ ] **Step 3: Open local browser**

Open: `http://localhost:5177`

Expected: UI loads, health pill says `本機服務正常`, controls fit without overlap.

- [ ] **Step 4: Create tiny synthetic white-background test video**

Run:

```powershell
ffmpeg -y -f lavfi -i "color=c=white:s=96x96:d=1:r=6" -vf "drawbox=x=32:y=24:w=32:h=48:color=red:t=fill" .work\synthetic-white.mp4
```

Expected: `.work\synthetic-white.mp4` exists.

- [ ] **Step 5: Upload and export synthetic video**

In the browser, select `.work\synthetic-white.mp4`, wait for background detection, then export.

Expected: zip download link appears. Export contains `sprite-sheet-001.png`, `metadata.json`, and transparent `frames`.

- [ ] **Step 6: Record smoke test**

Append to `MissionCenter/smoke-tests.md`:

```md
| 2026-05-21 | BR-T9 | 端到端 Sprite Sheet 匯出 | 使用 synthetic-white.mp4 透過網頁匯出 | 產生透明 Sprite Sheet PNG 與 metadata JSON | 通過；下載 zip 含 sprite-sheet-001.png 與 metadata.json | Pass | manual |
```

- [ ] **Step 7: Update task states**

Update `MissionCenter/tasks.md` so completed MVP tasks are `Done`, AI mode remains `Backlog` or `Review` depending on implementation, and closeout reflects remaining work.

- [ ] **Step 8: Update progress and snapshot**

Update `MissionCenter/progress.md` and `MissionCenter/snapshot.md` with final current state, remaining limitations, and next action.

---

## Self-Review

- Spec coverage: upload, background detection, fast keying, Sprite Sheet output, metadata JSON, AI experimental mode, error handling, and smoke tests all map to tasks.
- Placeholder scan: no implementation step depends on unnamed helper behavior; AI matting is intentionally a documented MVP stub.
- Type consistency: settings use `backgroundColor`, `tolerance`, `feather`, `despill`, `fps`, `scale`, `maxSheetWidth`, and `maxSheetHeight` consistently across frontend and backend.
