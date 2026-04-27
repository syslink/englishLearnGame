import {
  getOpenAIConfig,
  DEFAULT_CHAT_MODEL,
  upstreamHeaders,
  errorJson,
  CORS_HEADERS,
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
 * 兼容 OpenAI Chat Completions API，支持流式和非流式。
 * 请求体格式与 OpenAI 完全一致，会透传到上游 API。
 *
 * 如未指定 model，使用 OPENAI_CHAT_MODEL 环境变量或默认 gpt-4o-mini。
 */
export async function POST(req: Request) {
  let config;
  try {
    config = getOpenAIConfig();
  } catch {
    return errorJson("服务端 AI 未配置", 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson("请求体格式错误", 400);
  }

  // 基础校验
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return errorJson("messages 不能为空", 400);
  }

  // 补默认 model
  if (!body.model) {
    body.model = DEFAULT_CHAT_MODEL;
  }

  const isStream = body.stream === true;

  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: upstreamHeaders(config.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "unknown error");
      console.error("chat upstream error:", upstream.status, errText);
      return errorJson(
        `上游 API 错误 (${upstream.status})`,
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
    return errorJson("请求上游 API 失败", 502);
  }
}
