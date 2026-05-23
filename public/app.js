import { buildFrameRows, resolveSheetUrls, summarizeMetadata } from "./resultPresenter.js";

const healthStatus = document.querySelector("#healthStatus");
const videoFile = document.querySelector("#videoFile");
const fileName = document.querySelector("#fileName");
const videoMeta = document.querySelector("#videoMeta");
const backgroundColor = document.querySelector("#backgroundColor");
const mode = document.querySelector("#mode");
const tolerance = document.querySelector("#tolerance");
const feather = document.querySelector("#feather");
const despill = document.querySelector("#despill");
const fps = document.querySelector("#fps");
const scale = document.querySelector("#scale");
const maxSheetWidth = document.querySelector("#maxSheetWidth");
const padding = document.querySelector("#padding");
const extrude = document.querySelector("#extrude");
const exportButton = document.querySelector("#exportButton");
const downloadLink = document.querySelector("#downloadLink");
const logOutput = document.querySelector("#logOutput");
const resultPanel = document.querySelector("#resultPanel");
const resultSummary = document.querySelector("#resultSummary");
const sheetPreviewList = document.querySelector("#sheetPreviewList");
const coordinateCount = document.querySelector("#coordinateCount");
const frameTableBody = document.querySelector("#frameTableBody");

let currentJobId = null;

function log(message) {
  logOutput.textContent = message;
}

function resetResult() {
  resultPanel.hidden = true;
  resultSummary.textContent = "";
  coordinateCount.textContent = "";
  sheetPreviewList.replaceChildren();
  frameTableBody.replaceChildren();
}

function renderResult(result) {
  const metadata = result.metadata;
  const sheetUrls = resolveSheetUrls(result, currentJobId);
  const frameRows = buildFrameRows(metadata);

  resultSummary.textContent = summarizeMetadata(metadata);
  coordinateCount.textContent = `${frameRows.length} frames`;
  sheetPreviewList.replaceChildren();

  const previewFragment = document.createDocumentFragment();
  sheetUrls.forEach((sheet) => {
    const preview = document.createElement("figure");
    preview.className = "sheet-preview";

    const imageWrap = document.createElement("div");
    imageWrap.className = "sheet-preview-frame";

    const image = document.createElement("img");
    image.src = sheet.url;
    image.alt = sheet.file;
    image.loading = "lazy";

    const caption = document.createElement("figcaption");
    caption.textContent = sheet.file;

    imageWrap.append(image);
    preview.append(imageWrap, caption);
    previewFragment.append(preview);
  });
  sheetPreviewList.append(previewFragment);

  const rowFragment = document.createDocumentFragment();
  frameRows.forEach((frame) => {
    const row = document.createElement("tr");
    [frame.index, frame.sheet, frame.frameRect, frame.cellRect].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    rowFragment.append(row);
  });
  frameTableBody.replaceChildren(rowFragment);
  resultPanel.hidden = false;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    if (!result.ok) {
      healthStatus.textContent = "服務異常";
      return;
    }
    healthStatus.textContent = result.tools?.available ? "本機服務正常" : "服務正常，ffmpeg 受限";
  } catch {
    healthStatus.textContent = "連線失敗";
  }
}

checkHealth();

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
  exportButton.disabled = false;
}

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
    maxSheetHeight: 4096,
    padding: Number(padding.value),
    extrude: Number(extrude.value)
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
    renderResult(job.result);
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

async function uploadVideo(file) {
  const formData = new FormData();
  formData.append("video", file);
  resetResult();
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
  log("影片已讀取，正在偵測背景色...");
  await detectBackground();
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

exportButton.addEventListener("click", async () => {
  if (!currentJobId) return;
  exportButton.disabled = true;
  downloadLink.hidden = true;
  resetResult();
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

mode.addEventListener("change", async () => {
  if (mode.value !== "ai") return;
  const response = await fetch("/api/ai/status");
  const status = await response.json();
  if (!status.available) {
    log(status.message);
  }
});
