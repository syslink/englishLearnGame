import {
  getOpenAIConfig,
  DEFAULT_STT_MODEL,
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
 * POST /api/v1/audio/transcriptions
 *
 * 兼容 OpenAI Whisper API — 将音频文件转为文字。
 * 请求体为 multipart/form-data（与 OpenAI 一致）：
 *   file:     音频文件（必须）
 *   model:    模型名（可选，默认 whisper-1）
 *   language: 语言代码（可选，如 "en"）
 *   prompt:   上下文提示（可选）
 *   response_format: 返回格式 json/text/srt/verbose_json/vtt（可选）
 */
export async function POST(req: Request) {
  let config;
  try {
    config = getOpenAIConfig();
  } catch {
    return errorJson("服务端 AI 未配置", 500);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorJson("请求体必须为 multipart/form-data", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return errorJson("缺少 file 字段", 400);
  }

  // 限制音频大小 25MB（OpenAI 上限）
  if (file.size > 25 * 1024 * 1024) {
    return errorJson("音频文件不能超过 25MB", 400);
  }

  // 补默认 model
  if (!formData.get("model")) {
    formData.set("model", DEFAULT_STT_MODEL);
  }

  try {
    const upstream = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: upstreamHeaders(config.apiKey),
      body: formData,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "unknown error");
      console.error("transcription upstream error:", upstream.status, errText);
      return errorJson(
        `上游 API 错误 (${upstream.status})`,
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      );
    }

    // 根据 response_format 决定返回 Content-Type
    const format = (formData.get("response_format") as string) || "json";
    const responseBody = await upstream.arrayBuffer();
    const contentType =
      format === "json" || format === "verbose_json"
        ? "application/json"
        : format === "srt" || format === "vtt"
          ? "text/plain; charset=utf-8"
          : "text/plain; charset=utf-8";

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error("transcription error:", err);
    return errorJson("语音识别请求失败", 502);
  }
}
