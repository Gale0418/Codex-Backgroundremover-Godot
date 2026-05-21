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

## 髮絲 AI 模式

髮絲 AI 模式是 Experimental。MVP 先保留介面與能力偵測，模型依賴尚未內建。快速 keying 是第一版保底路線。

## Godot 使用方式

將輸出的 `sprite-sheet-001.png` 匯入 Godot。依 `metadata.json` 的 `frameWidth`、`frameHeight`、`fps`、`columns` 建立動畫格。
