# 決策紀錄

## 2026-05-21：MVP 輸出選擇 Sprite Sheet

- 決策：第一版輸出 Godot 友善的透明 Sprite Sheet PNG + metadata JSON，而不是透明影片。
- 原因：Godot 對影片透明通道支援不適合作為最快 MVP；Sprite Sheet 對 2D 角色動作與建築變形都更穩。
- 影響：匯出流程要控制 FPS、格子尺寸、最大 sheet 尺寸與多 sheet 切分。

## 2026-05-21：保留快速模式與髮絲模式

- 決策：快速模式使用純色背景 keying；髮絲級 AI matting 作為 Experimental。
- 原因：快速模式可保證本機離線出成品；AI 模式可改善髮絲與半透明邊緣，但依賴較重且可能逐幀閃爍。
- 影響：架構需要把匯出管線與 AI worker 分離，避免 AI 依賴拖累基本功能。

## 2026-05-21：自動偵測背景色但允許手動覆蓋

- 決策：影片載入後抽樣影格邊緣像素，推測背景色並顯示色塊。
- 原因：大多數網頁生成影片背景在邊緣穩定，自動偵測可以減少操作步驟。
- 影響：角色或建築貼邊時可能偵測錯，所以 UI 必須保留白、黑、綠與自訂顏色覆蓋。

## 2026-05-22：Sprite Sheet 加入格間距與邊緣延展

- 決策：匯出時預設 `padding: 2`、`extrude: 1`，並寫入 `metadata.json`。
- 原因：Godot 或其他遊戲引擎在縮放、filter、mipmap 或 subpixel 移動時，無間格 atlas 容易取樣到相鄰格。
- 影響：sheet 尺寸會略微變大；Godot 切格時需參考 metadata 的 `cellWidth`、`cellHeight`、`padding`、`extrude`。
