# Godot 透明 Sprite Sheet 影片去背工具

本工具在本機執行，將短影片轉成 Godot 可用的透明 Sprite Sheet PNG 與 metadata JSON。

## 執行

```powershell
npm install
npm run dev
```

開啟 `http://localhost:5177`。

## 第一版支援

- 自動偵測影片邊緣背景色。
- 快速純色 keying。
- 輸出透明 Sprite Sheet PNG。
- 輸出 metadata JSON。
- 可設定格間距與邊緣延展，降低 Godot 取樣到隔壁格的風險。
- 匯出完成後在頁面下方顯示 sheet 預覽與每一幀座標。

## 髮絲 AI 模式

髮絲 AI 模式是 Experimental。MVP 先保留介面與能力偵測，模型依賴尚未內建。快速 keying 是第一版保底路線。

## Godot 使用方式

將輸出的 `sprite-sheet-001.png` 匯入 Godot。匯出完成後，頁面下方會顯示成果預覽與每一幀座標；完整資料也會寫入 `metadata.json`。

`metadata.json` 的 `frames` 會列出：

- `frameRect`：真正影格的取圖範圍，適合給 Godot atlas/region 使用。
- `cellRect`：包含 `extrude` 邊緣延展後的整格範圍，可用來檢查 padding 與格線配置。

如果使用 `padding` 或 `extrude`，優先依 `frames[].frameRect` 切圖。預設建議是 `padding: 2`、`extrude: 1`。

## 來源浮水印

工具會保留來源影片內容，不會自動移除生成服務的浮水印或標記。若來源影片右下角帶有標記，輸出的 Sprite Sheet 也會保留它。
