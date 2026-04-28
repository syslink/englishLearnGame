import {
  getOpenAIConfig,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  upstreamHeaders,
  errorJson,
  CORS_HEADERS,
  describeFetchError,
} from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/v1/audio/speech
 *
 * 兼容 OpenAI TTS API — 将文本转为语音音频。
 * 请求体 JSON：
 *   input:            要合成的文本（必须，最大 4096 字符）
 *   model:            模型名（可选，默认 gpt-4o-mini-tts）
 *   voice:            发音人（可选，默认 marin）
 *   response_format:  音频格式 mp3/opus/aac/flac/wav/pcm（可选，默认 mp3）
 *   speed:            语速 0.25-4.0（可选，默认 1.0）
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

  if (typeof body.input !== "string" || !body.input.trim()) {
    return errorJson("input 不能为空", 400);
  }

  if ((body.input as string).length > 4096) {
    return errorJson("input 不能超过 4096 字符", 400);
  }

  // 补默认值
  if (!body.model) body.model = DEFAULT_TTS_MODEL;
  if (!body.voice) body.voice = DEFAULT_TTS_VOICE;

  const format = (body.response_format as string) || "mp3";
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/pcm",
  };

  try {
    const upstream = await fetch(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: upstreamHeaders(config.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "unknown error");
      console.error("tts upstream error:", upstream.status, errText);
      return errorJson(
        `上游 API 错误 (${upstream.status})`,
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      );
    }

    // 流式返回音频数据
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": mimeMap[format] || "audio/mpeg",
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error("tts error:", err);
    return errorJson(describeFetchError(err, "OpenAI TTS"), 502);
  }
}
