import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  DEFAULT_MINIMAX_TTS_MODEL,
  DEFAULT_MINIMAX_TTS_VOICE,
  getVoiceProviderConfig,
  upstreamHeaders,
  errorJson,
  CORS_HEADERS,
  describeFetchError,
  openAiUserFriendlyError,
} from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/v1/audio/speech
 *
 * 兼容云端 TTS API — 将文本转为语音音频。
 * 请求体 JSON：
 *   provider:         openai/minimax（可选，默认 openai）
 *   input:            要合成的文本（必须，最大 4096 字符）
 *   model:            模型名（可选，按供应商默认）
 *   voice:            发音人（可选，按供应商默认）
 *   response_format:  音频格式 mp3/opus/aac/flac/wav/pcm（可选，默认 mp3）
 *   speed:            语速 0.25-4.0（可选，默认 1.0）
 */
export async function POST(req: Request) {
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

  let config;
  try {
    config = getVoiceProviderConfig(body.provider);
  } catch {
    return errorJson("服务端语音服务未配置", 500);
  }

  const format = (body.response_format as string) || "mp3";
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/pcm",
  };

  if (config.id === "minimax") {
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : DEFAULT_MINIMAX_TTS_MODEL;
    const voice = typeof body.voice === "string" && body.voice.trim()
      ? body.voice.trim()
      : DEFAULT_MINIMAX_TTS_VOICE;
    const speed = Math.max(0.5, Math.min(2, Number(body.speed) || 1));

    try {
      const groupQuery = config.groupId ? `?GroupId=${encodeURIComponent(config.groupId)}` : "";
      const upstream = await fetch(`${config.baseUrl}/t2a_v2${groupQuery}`, {
        method: "POST",
        headers: upstreamHeaders(config.apiKey, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          model,
          text: body.input,
          stream: false,
          output_format: "hex",
          voice_setting: {
            voice_id: voice,
            speed,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1,
          },
        }),
      });

      const data = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        console.error("minimax tts upstream error:", upstream.status, data);
        return errorJson(
          `MiniMax 语音 API 错误 (${upstream.status})`,
          upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
        );
      }

      const audioHex = data?.data?.audio;
      if (typeof audioHex !== "string" || !audioHex) {
        console.error("minimax tts invalid response:", data);
        return errorJson("MiniMax 语音 API 返回音频为空", 502);
      }

      return new Response(Buffer.from(audioHex, "hex"), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
          ...CORS_HEADERS,
        },
      });
    } catch (err) {
      console.error("minimax tts error:", err);
      return errorJson(describeFetchError(err, "MiniMax TTS"), 502);
    }
  }

  if (config.id === "aliyun") {
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : config.defaultModel;
    const voice = typeof body.voice === "string" && body.voice.trim()
      ? body.voice.trim()
      : config.defaultVoice;
    const speed = Math.max(0.5, Math.min(2, Number(body.speed) || 1));

    try {
      const upstream = await fetch(`${config.baseUrl}/services/audio/tts/SpeechSynthesizer`, {
        method: "POST",
        headers: upstreamHeaders(config.apiKey, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          model,
          input: {
            text: body.input,
            voice,
            format: "mp3",
            sample_rate: 24000,
            rate: speed,
          },
        }),
      });

      const data = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        console.error("aliyun tts upstream error:", upstream.status, data);
        return errorJson(
          `阿里云语音合成 API 错误 (${upstream.status})`,
          upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
        );
      }

      const audioUrl =
        data?.output?.audio?.url ||
        data?.output?.audios?.[0]?.url ||
        data?.output?.results?.[0]?.url ||
        data?.output?.url;
      if (typeof audioUrl !== "string" || !audioUrl) {
        console.error("aliyun tts invalid response:", data);
        return errorJson("阿里云语音合成返回音频为空", 502);
      }

      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) {
        console.error("aliyun tts audio download error:", audioResp.status);
        return errorJson(`阿里云音频下载失败 (${audioResp.status})`, 502);
      }

      return new Response(audioResp.body, {
        status: 200,
        headers: {
          "Content-Type": audioResp.headers.get("Content-Type") || "audio/mpeg",
          "Cache-Control": "no-cache",
          ...CORS_HEADERS,
        },
      });
    } catch (err) {
      console.error("aliyun tts error:", err);
      return errorJson(describeFetchError(err, "阿里云语音合成"), 502);
    }
  }

  const openAiBody = { ...body };
  delete openAiBody.provider;
  if (!openAiBody.model) openAiBody.model = DEFAULT_TTS_MODEL;
  if (!openAiBody.voice) openAiBody.voice = DEFAULT_TTS_VOICE;

  try {
    const upstream = await fetch(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: upstreamHeaders(config.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(openAiBody),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "unknown error");
      console.error("tts upstream error:", upstream.status, errText);
      return errorJson(
        openAiUserFriendlyError(`语音合成接口返回 ${upstream.status}`),
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
    return errorJson(openAiUserFriendlyError(describeFetchError(err, "OpenAI 语音合成")), 502);
  }
}
