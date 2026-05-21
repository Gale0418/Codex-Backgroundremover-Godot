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
