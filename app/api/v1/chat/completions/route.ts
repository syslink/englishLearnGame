import {
  getCloudProviderConfig,
  upstreamHeaders,
  errorJson,
  CORS_HEADERS,
  describeFetchError,
  openAiUserFriendlyError,
} from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CORS preflight
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/v1/chat/completions
 *
 * 兼容 OpenAI Chat Completions API，支持 OpenAI / DeepSeek，支持流式和非流式。
 * 请求体格式与 OpenAI 完全一致，会透传到上游 API。
 *
 * 扩展字段 provider: "openai" | "deepseek" 用于选择云端供应商。
 * 如未指定 model，使用对应供应商的默认模型。
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson("请求体格式错误", 400);
  }

  let config;
  try {
    config = getCloudProviderConfig(body.provider);
  } catch {
    return errorJson("所选云端 AI 未配置", 500);
  }

  // 基础校验
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return errorJson("messages 不能为空", 400);
  }

  // 补默认 model
  if (!body.model) {
    body.model = config.defaultModel;
  }
  delete body.provider;

  const isStream = body.stream === true;

  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: upstreamHeaders(config.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "unknown error");
      console.error(`${config.label} chat upstream error:`, upstream.status, errText);
      return errorJson(
        config.id === "openai"
          ? openAiUserFriendlyError(`接口返回 ${upstream.status}`)
          : `上游 API 错误 (${upstream.status})`,
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      );
    }

    if (isStream) {
      // 流式：直接透传 SSE 流
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...CORS_HEADERS,
        },
      });
    }

    // 非流式：解析 JSON 返回
    const data = await upstream.json();
    return Response.json(data, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("chat completions error:", err);
    return errorJson(
      config.id === "openai" ? openAiUserFriendlyError(describeFetchError(err, "OpenAI")) : describeFetchError(err, config.label),
      502,
    );
  }
}
