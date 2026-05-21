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
