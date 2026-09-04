# 🦀 Godot 透明 Sprite Sheet 影片去背工具 — Rust Edition

本工具在本機執行：把短影片抽幀、去除單色背景，輸出 **Godot 可直接使用的透明 Sprite Sheet PNG + `metadata.json` + ZIP**。

從 v0.2 起，Node/Express/Sharp 後端已改為 **Rust + Axum + image + Rayon**；瀏覽器介面仍維持無框架的 HTML/CSS/JavaScript，因此不需要 Node.js runtime。

## 為什麼 Rust 化

- 影像像素處理由 Rust 執行，並使用 Rayon 平行化 frame/pixel 工作。
- HTTP server、工作狀態、ffmpeg/ffprobe 呼叫、Sprite Sheet、ZIP 都在 Rust。
- 上傳採串流寫檔，不把 200 MiB 影片整包塞進 RAM。
- 阻塞型影像與壓縮工作透過 `spawn_blocking` 隔離，避免卡住 Tokio executor。
- `main` 由 GitHub Actions 執行 `fmt + clippy -D warnings + test + release build`。

## 需求

- Rust **1.98.0**
- `ffmpeg`
- `ffprobe`

macOS：

```bash
brew install ffmpeg
rustup toolchain install 1.98.0 --component rustfmt clippy
```

## 執行

```bash
cargo run --release
```

開啟 <http://localhost:5177>。

可用環境變數：

- `PORT=5177`：服務埠。
- `BG_REMOVER_ROOT=/path/to/repo`：若不是從 repo 根目錄啟動，可指定 `public/` 與 `.work/` 的根目錄。
- `RUST_LOG=info`：調整 server log。

## 現有能力

- 影片上傳與 ffprobe metadata。
- 自動偵測影片邊緣背景色。
- Rust 快速純色 keying。
- feather 半透明邊緣。
- 綠幕 despill。
- Rayon 平行處理影格與像素。
- 透明 Sprite Sheet PNG。
- `padding` 與 `extrude`，降低 Godot atlas 邊緣取樣到隔壁格的風險。
- `metadata.json` 內含每幀 `frameRect` / `cellRect`。
- 頁面內 Sprite Sheet 預覽與動畫預覽。
- ZIP 一鍵下載。
- 200 MiB 上傳上限與 export 併發保護。
- 每次 export 最多 1,200 幀，並限制總處理像素量，避免短影片設定失控把磁碟／RAM 吃光。
- 中間 raw/keyed frames 成功後立即清理；下載 ZIP 只包含 Sprite Sheet 與 `metadata.json`。

## 髮絲 AI 模式

`ai` 模式目前仍為明確的 experimental capability gate，不會偷偷上傳圖片到第三方服務。

Rust 生態已經有 U2Net / ISNet + ONNX Runtime 的實作可參考；下一步建議採 **本機 ONNX**，模型按需下載並快取，而不是把遠端 API 當成必要依賴。這樣能維持本工具「素材不離開本機」的定位。

目前 `/api/ai/status` 會回報尚未安裝模型，快速 keying 仍是可用的保底路線。

## Godot 使用

將輸出的 `sprite-sheet-001.png` 匯入 Godot。

`metadata.json` 的 `frames`：

- `frameRect`：真正影格範圍，適合 atlas/region。
- `cellRect`：包含 `extrude` 後的整格範圍，用於檢查 padding 與格線。

有使用 `padding` 或 `extrude` 時，優先依 `frames[].frameRect` 切圖。預設建議 `padding: 2`、`extrude: 1`。

## 開發驗證

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo build --release
```

嚴格 review 用的專用提示詞放在 [`docs/strict-rust-review-prompt.md`](docs/strict-rust-review-prompt.md)。

## 來源浮水印

工具只處理背景與透明度，不會自動移除來源影片內既有的浮水印或標記。
