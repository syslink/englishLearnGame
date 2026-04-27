import {
  getOpenAIConfig,
  upstreamHeaders,
  errorJson,
  CORS_HEADERS,
} from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/v1/models
 *
 * 兼容 OpenAI Models API — 列出上游可用模型。
 */
export async function GET() {
  let config;
  try {
    config = getOpenAIConfig();
  } catch {
    return errorJson("服务端 AI 未配置", 500);
  }

  try {
    const upstream = await fetch(`${config.baseUrl}/models`, {
      headers: upstreamHeaders(config.apiKey),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "unknown error");
      console.error("models upstream error:", upstream.status, errText);
      return errorJson(
        `上游 API 错误 (${upstream.status})`,
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      );
    }

    const data = await upstream.json();
    return Response.json(data, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("models error:", err);
    return errorJson("获取模型列表失败", 502);
  }
}
