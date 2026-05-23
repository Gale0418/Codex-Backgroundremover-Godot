# 進度

- 專案：Godot 透明 Sprite Sheet 影片去背工具
- 目前目標：在匯出後顯示動畫預覽、成果預覽，並列出 Godot 可用的每幀座標。
- 目前狀態：Execute
- 里程碑：完成本機 Web MVP，可匯入影片、偵測背景色、產出透明 Sprite Sheet PNG + metadata JSON。
- 進度條：[#########-] 90%
- 進行中任務：BR-T9 MVP smoke test 與 Godot 使用說明
- 阻塞原因：無
- 下次更新：推送到 GitHub，並整理公開 README 的路人視角說明。

## 目前結論

- 輸入：網頁生成影片或一般短影片檔。
- 核心輸出：透明 Sprite Sheet PNG 與 metadata JSON。
- Godot 座標：`metadata.frames[].frameRect` 是真正影格取圖範圍，`cellRect` 是含邊緣延展的整格範圍。
- 動畫預覽：匯出完成後用透明 sheet 在內建測試背景上逐幀播放，方便檢查去背邊緣。
- 模式：快速純色 keying 保底；實驗 AI matting 改善髮絲與半透明邊緣。
- 目標引擎：Godot。
