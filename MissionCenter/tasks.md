# 任務

| ID | 標題 | 類型 | 上層 | 優先級 | 狀態 | 負責人 | 依賴 | 下一步 | 驗證方式 | 估算 | 標籤 | 備註 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BR-E1 | Godot 透明 Sprite Sheet 影片去背工具 | Epic |  | P1 | In Progress | Codex |  | 建立實作計畫 | 完成 MVP smoke test | 21 | godot, sprite-sheet, mvp | 本機 Web + Node + ffmpeg，AI 髮絲模式為 Experimental |
| BR-T1 | 需求訪談與 intake | Task | BR-E1 | P1 | Done | Codex |  | 進入計畫 | 已確認目標、輸出、限制、風險與非目標 | 2 | intake | 2026-05-21 完成 |
| BR-T2 | Mission Center 工作區建立 | Task | BR-E1 | P2 | Done | Codex | BR-T1 | 維持同步 | 已執行 bootstrap 與任務樹整理 | 1 | plan |  |
| BR-T3 | 設計規格與實作計畫 | Task | BR-E1 | P1 | Done | Codex | BR-T2 | 進入執行 | 已寫入 docs/superpowers/plans/2026-05-21-godot-video-background-remover-implementation.md，且無 TBD/TODO 紅旗 | 2 | plan | 2026-05-21 完成 |
| BR-T4 | 本機 Web 專案骨架 | Task | BR-E1 | P1 | In Progress | Codex | BR-T3 | 建立 Node 後端與前端入口 | 可啟動 localhost 並看到工具主畫面 | 3 | web, node |  |
| BR-T5 | 影片匯入與背景色自動偵測 | Task | BR-E1 | P1 | Backlog | Codex | BR-T4 | 抽樣影格並統計邊緣背景色 | 對白底/黑底/綠幕測資回傳合理色塊 | 3 | detection, preview | 偵測結果可手動覆蓋 |
| BR-T6 | 快速純色 keying 匯出 | Task | BR-E1 | P1 | Backlog | Codex | BR-T5 | 串接 ffmpeg 產透明 frame | 產出透明 PNG frames，alpha 檢查通過 | 4 | ffmpeg, alpha | 保底模式 |
| BR-T7 | Sprite Sheet 與 metadata 產生 | Task | BR-E1 | P1 | Backlog | Codex | BR-T6 | 合併透明 frames 並輸出 JSON | PNG sheet 尺寸、格數、FPS 與 JSON 一致 | 4 | godot, export | 支援多張 sheet 以避免過大 |
| BR-T8 | 實驗髮絲級 AI matting 模式 | Task | BR-E1 | P2 | Backlog | Codex | BR-T7 | 規劃 Python worker 與模型依賴 | 能處理短片抽樣幀並輸出更細 alpha | 4 | ai, experimental | 可先用 rembg/transparent-background 類工具 |
| BR-T9 | MVP smoke test 與 Godot 使用說明 | Task | BR-E1 | P1 | Backlog | Codex | BR-T7 | 跑端到端測試並記錄 | smoke-tests.md 有可重複命令與觀察結果 | 2 | verification, docs | AI 模式若未裝依賴，不阻塞 MVP |
| BR-T10 | 收尾與下一階段選項 | Task | BR-E1 | P2 | Backlog | Codex | BR-T9 | 整理成果、限制與後續 | progress.md 與 snapshot.md 更新完成 | 1 | closeout |  |
