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
    padding: 2,
    extrude: 1,
    debugFrames: false
  }
};
