# 專案

- 專案：Godot 透明 Sprite Sheet 影片去背工具
- 週期：MVP 最快可用版
- 目標：建立完全本機運作的 Web 工具，讓使用者匯入網頁生成影片，自動偵測背景色，提供快速純色 keying 與實驗髮絲級 AI matting，輸出 Godot 可用的透明 Sprite Sheet PNG 與 metadata JSON。
- 成功標準：可用一段短影片產出至少一張透明 Sprite Sheet，Godot 可依 metadata 正確切格播放；快速模式可離線穩定完成，髮絲模式可在依賴安裝後提供較好的 alpha 邊緣。
- 硬限制：不雲端上傳、不做月費服務、不把整段大影片塞進瀏覽器記憶體；第一版優先本機 Windows + Node + ffmpeg。
- 非目標：第一版不做桌面 App 打包、不做透明影片材質輸出、不承諾所有髮絲都完美、不支援複雜背景一鍵去背。
- 擁有者：使用者負責驗收 Godot 素材需求；Codex 負責規劃、實作與驗證。
- 第一里程碑：完成本機 Web MVP，可匯入影片、偵測背景色、產出透明 Sprite Sheet PNG + metadata JSON。
- 主要風險：AI matting 依賴安裝較重、逐幀結果可能閃爍、大尺寸 Sprite Sheet 可能造成 Godot 匯入或顯存壓力。
- 標籤：local, godot, sprite-sheet, ffmpeg, alpha-matting, mvp

## Intake council

- 產品角度：最有價值的第一版是「影片變 Godot 可用透明動畫素材」，不是完整剪輯軟體。
- 技術角度：Sprite Sheet 比透明影片更符合 Godot MVP；快速 keying 可保底，AI matting 放入 Experimental。
- 驗證角度：用短影片跑出 PNG sheet 與 JSON，再檢查 alpha 與格數 metadata。
- 風險角度：髮絲級品質會受模型、CPU/GPU、來源影片壓縮與畫面貼邊影響。
- 維運角度：Node 後端負責檔案與 ffmpeg，Python AI worker 可獨立安裝，避免主流程被依賴拖垮。
- 效率角度：先做可用管線，再補預覽與品質調整；不要第一天就鑽進桌面打包。
- 野路子角度：保留「快速模式」讓主人先玩到成品，髮絲模式再慢慢馴服，不然又會變成一個巨大研究專案。

## 活動紀錄

- 2026-05-21：完成 Mission Center intake 與設計規格整理。
- 2026-05-21：決定以 Godot 透明 Sprite Sheet 為 MVP 輸出，並納入實驗髮絲級 AI 模式。
- 2026-05-21：完成實作計畫，進入 MVP Web 骨架執行。

## 開放留言

- 待確認：第一版範例影片來源、常見解析度與希望的預設 FPS。
