// OpenAI / DeepSeek 兼容 API 配置与工具函数

export type CloudProvider = "openai" | "deepseek";

type ProviderConfig = {
  id: CloudProvider;
  label: string;
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
};

const PROVIDERS: Record<CloudProvider, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    defaultModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    defaultModel: process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat",
  },
};

export function normalizeCloudProvider(provider: unknown): CloudProvider {
  return provider === "deepseek" ? "deepseek" : "openai";
}

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

export function getCloudProviderConfig(providerInput: unknown = "openai") {
  const provider = normalizeCloudProvider(providerInput);
  const config = PROVIDERS[provider];
  if (!config.apiKey) {
    throw new Error(`${config.label} API Key 未配置`);
  }
  return {
    id: config.id,
    label: config.label,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    defaultModel: config.defaultModel,
  };
}

export function getCloudProviderSummaries() {
  return (Object.values(PROVIDERS) as ProviderConfig[]).map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: Boolean(provider.apiKey),
    baseUrl: provider.baseUrl.replace(/\/+$/, ""),
    defaultModel: provider.defaultModel,
  }));
}

// 默认模型（可通过环境变量覆盖）
export const DEFAULT_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
export const DEFAULT_TTS_MODEL =
  process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const DEFAULT_STT_MODEL =
  process.env.OPENAI_STT_MODEL || "whisper-1";
export const DEFAULT_TTS_VOICE =
  process.env.OPENAI_TTS_VOICE || "marin";

// 构建上游请求头
export function upstreamHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

export function describeFetchError(err: unknown, providerLabel = "上游 API"): string {
  const error = err as {
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };
  const code = error?.cause?.code || error?.code;
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
    return `无法连接到 ${providerLabel}（连接超时）。请检查服务器网络、代理或 BASE_URL 配置。`;
  }
  if (code === "ENOTFOUND") {
    return `无法解析 ${providerLabel} 域名。请检查 DNS、网络或 BASE_URL 配置。`;
  }
  if (code === "ECONNREFUSED") {
    return `${providerLabel} 拒绝连接。请检查 BASE_URL 是否可访问。`;
  }
  if (code === "ECONNRESET") {
    return `连接 ${providerLabel} 时被重置。请稍后重试或检查网络代理。`;
  }
  return `请求 ${providerLabel} 失败：${error?.message || "未知网络错误"}`;
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
