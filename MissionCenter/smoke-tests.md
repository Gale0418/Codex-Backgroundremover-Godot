# Smoke Tests

| 日期 | 關聯任務 ID | 測試內容 | 測試方式 | 預期結果 | 實際結果 | 通過 / 失敗 | 執行類型 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 待執行 | BR-T9 | 端到端 Sprite Sheet 匯出 | 啟動本機工具，上傳短影片，使用快速 keying 匯出 | 產生透明 Sprite Sheet PNG 與 metadata JSON，frame count 與 FPS 正確 | 尚未執行 | Pending | automated/manual |
| 待執行 | BR-T8 | 實驗 AI 髮絲模式抽樣 | 安裝 AI 依賴後，對短片抽樣幀輸出 alpha PNG | alpha 邊緣比快速 keying 更細，但允許速度較慢 | 尚未執行 | Pending | manual |
| 2026-05-22 | BR-T7 | Sprite Sheet 格間距與邊緣延展 | 執行 `npm test` | padding/extrude layout、metadata、export API 測試通過 | 9 files / 14 tests 全部通過 | Pass | automated |
| 2026-05-23 | BR-T7 | Godot 每幀座標與成果預覽資料 | 執行 `npm test` | metadata frames、sheetUrls、前端 presenter、既有 API 測試通過 | 10 files / 18 tests 全部通過 | Pass | automated |
| 2026-05-23 | BR-T7 | 本機匯出 smoke | 上傳 1 秒綠幕測試影片到 5177 API 並匯出 | 產出 sheet、zip、15 筆 `frames[].frameRect`，sheet 靜態路徑可存取 | job `21101fc5-e47f-4f5e-a6d7-012162b23c1a` done，sheet HEAD 200，首幀 `frameRect x:1 y:1 w:160 h:120` | Pass | automated/browser |
| 2026-05-23 | BR-T9 | 動畫預覽 UI smoke | 重啟 5177，瀏覽器載入主頁並檢查 canvas、背景切換與 console | 動畫預覽 DOM 存在，預設測試背景，沒有前端 console error | `animationCanvas`、`animationStage` 存在，背景選項 `scene/checker/dark`，console error 0 | Pass | browser |
| 2026-05-23 | BR-T9 | 動畫預覽資料 smoke | 上傳 1 秒綠幕測試影片到 5177 API 並匯出 | 產出 15 筆 frame metadata，可供動畫預覽逐幀播放 | job `8ab9c873-2cf0-481c-bb73-f8c5e11af7b1` done，首幀 `frameRect x:1 y:1 w:160 h:120` | Pass | automated |
