# Godot 透明 Sprite Sheet 影片去背工具設計

## 目標

建立一個完全本機運作的影片去背工具，讓使用者把網頁生成影片轉成 Godot 可用的透明 Sprite Sheet 素材。第一版追求最快可用，不做雲端上傳、不做月費服務，也不先做桌面 App 打包。

## 使用情境

使用者會拿到一段網頁生成的短影片，內容可能是會動的人物角色，或建築物變形動畫。工具需要將背景去掉，輸出透明 PNG Sprite Sheet 與 metadata JSON，讓 Godot 能依格子尺寸、FPS 與 frame count 播放動畫。

## 範圍

第一版包含：

- 本機 Web 介面與 Node 後端。
- 影片上傳或選取。
- 自動背景色偵測，並允許手動覆蓋。
- 快速純色 keying 模式。
- 實驗髮絲級 AI matting 模式。
- 輸出透明 Sprite Sheet PNG。
- 輸出 metadata JSON，記錄 sheet 清單、frame size、columns、rows、FPS、frame count。
- 基本抽樣預覽，不追求完整即時整段影片預覽。

第一版不包含：

- Electron 或 Tauri 桌面 App 打包。
- 透明影片輸出。
- 複雜背景的一鍵精準去背。
- 保證所有髮絲、半透明與動態模糊都完美。

## 架構

前端負責操作流程：選影片、顯示偵測到的背景色、調整 tolerance、feather、despill、FPS、輸出尺寸與 sheet 最大寬度。預覽以抽樣幀為主，避免瀏覽器快取整段影片造成記憶體壓力。

Node 後端負責檔案管理、呼叫 ffmpeg、管理匯出工作與回傳進度。快速模式使用 ffmpeg 或後端影像處理管線產生透明 PNG frames，再合成 Sprite Sheet。

AI matting 作為獨立 experimental worker。第一版可用 Python 工具或模型整合，依賴未安裝時不影響快速模式。AI worker 的輸入是抽出的影片幀，輸出是帶 alpha 的 PNG frames。

## 資料流程

1. 使用者選取影片。
2. 後端保存到暫存工作目錄。
3. 後端抽取數張代表影格。
4. 背景偵測器讀取影格四周邊緣像素，估算背景色。
5. 前端顯示偵測色塊與參數。
6. 使用者選快速模式或髮絲模式並按匯出。
7. 後端依 FPS 與縮放設定抽幀。
8. 去背管線輸出透明 PNG frames。
9. Sprite Sheet 產生器依最大尺寸切成一張或多張 PNG。
10. 後端輸出 metadata JSON。

## 背景偵測

背景偵測只作為預設值。演算法抽樣影片開始、中段與後段的影格，統計影格四周邊緣像素，排除明顯離群點後取得主要背景色。若角色或建築貼到邊緣，偵測可能失準，因此 UI 必須提供白、黑、綠與自訂色覆蓋。

## 去背模式

快速模式針對白、黑、綠或自訂純色背景。它應該穩定、離線、速度快，並作為 MVP 成功保底。

髮絲模式用 AI matting 改善細節，定位為 Experimental。它可以比較慢，也可以要求額外安裝 Python 依賴，但不能阻塞快速模式。若模型在逐幀結果上出現閃爍，第一版先記錄限制，不把 temporal consistency 當成硬性完成條件。

## 輸出格式

輸出資料夾包含：

- `sprite-sheet-001.png` 等透明 Sprite Sheet。
- `metadata.json`，包含 FPS、frame count、frame width、frame height、columns、rows、sheet file list。
- 可選 debug frames，方便檢查 alpha。

Sprite Sheet 需要支援最大寬度或最大尺寸限制。當幀數太多或尺寸太大時，自動切成多張 sheet，避免 Godot 匯入與顯存壓力過高。

## 錯誤處理

- 找不到 ffmpeg：前端顯示安裝提示與偵測失敗原因。
- 影片格式無法讀取：顯示 ffmpeg 錯誤摘要。
- AI 依賴未安裝：髮絲模式標示不可用，但快速模式仍可使用。
- 輸出尺寸過大：顯示警告並建議降低 FPS、縮放尺寸或切多張 sheet。

## 驗證

MVP smoke test：

- 啟動本機工具。
- 匯入短影片。
- 自動偵測背景色。
- 使用快速模式匯出透明 Sprite Sheet。
- 檢查 PNG 具有 alpha。
- 檢查 metadata 的 frame count、FPS 與 sheet 格數一致。

髮絲模式 smoke test：

- 安裝 AI 依賴。
- 對短影片或抽樣幀執行 matting。
- 檢查輸出的 alpha 邊緣比快速模式更細。

## 風險

- AI matting 依賴可能下載模型或要求較高硬體。
- 大影片可能產生巨大 Sprite Sheet。
- 逐幀 AI matting 可能有閃爍。
- 自動背景色偵測在主體貼邊時可能抓錯。
- 複雜背景不適合第一版。
