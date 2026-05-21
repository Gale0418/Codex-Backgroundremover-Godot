# 進度

- 專案：Godot 透明 Sprite Sheet 影片去背工具
- 目前目標：開始本機 Web + Node + ffmpeg 的第一個可跑版本。
- 目前狀態：Execute
- 里程碑：完成本機 Web MVP，可匯入影片、偵測背景色、產出透明 Sprite Sheet PNG + metadata JSON。
- 進度條：[###-------] 30%
- 進行中任務：BR-T4 本機 Web 專案骨架
- 阻塞原因：無
- 下次更新：建立 package、Express 服務、前端入口與第一個 API smoke test。

## 目前結論

- 輸入：網頁生成影片或一般短影片檔。
- 核心輸出：透明 Sprite Sheet PNG 與 metadata JSON。
- 模式：快速純色 keying 保底；實驗 AI matting 改善髮絲與半透明邊緣。
- 目標引擎：Godot。
