# 進度

- 專案：Godot 透明 Sprite Sheet 影片去背工具
- 目前目標：改善 Sprite Sheet 匯出格式，讓 Godot 使用時不會上下格黏在一起。
- 目前狀態：Execute
- 里程碑：完成本機 Web MVP，可匯入影片、偵測背景色、產出透明 Sprite Sheet PNG + metadata JSON。
- 進度條：[######----] 60%
- 進行中任務：BR-T7 Sprite Sheet 與 metadata 產生
- 阻塞原因：無
- 下次更新：用實際影片重新匯出，確認透明格間距與 metadata 切格資訊符合 Godot 使用需求。

## 目前結論

- 輸入：網頁生成影片或一般短影片檔。
- 核心輸出：透明 Sprite Sheet PNG 與 metadata JSON。
- 模式：快速純色 keying 保底；實驗 AI matting 改善髮絲與半透明邊緣。
- 目標引擎：Godot。
