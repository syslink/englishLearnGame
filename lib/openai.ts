// OpenAI 兼容 API 配置与工具函数

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未配置");
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
  return { apiKey, baseUrl };
}

// 默认模型（可通过环境变量覆盖）
export const DEFAULT_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
export const DEFAULT_TTS_MODEL =
  process.env.OPENAI_TTS_MODEL || "tts-1";
export const DEFAULT_STT_MODEL =
  process.env.OPENAI_STT_MODEL || "whisper-1";
export const DEFAULT_TTS_VOICE =
  process.env.OPENAI_TTS_VOICE || "alloy";

// 构建上游请求头
export function upstreamHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

// 统一错误响应
export function errorJson(message: string, status: number) {
  return Response.json(
    {
      error: {
        message,
        type: "api_error",
        code: status === 401 ? "unauthorized" : status === 429 ? "rate_limit" : "server_error",
      },
    },
    { status },
  );
}

// CORS 响应头
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
