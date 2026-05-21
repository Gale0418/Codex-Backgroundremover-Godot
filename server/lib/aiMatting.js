export async function getAiMattingStatus() {
  return {
    mode: "experimental",
    available: false,
    message: "髮絲 AI 模式尚未安裝模型依賴；目前請使用快速 keying 匯出。"
  };
}
