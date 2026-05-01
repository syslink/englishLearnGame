import type { VoiceProviderId } from "./types";

const TTS_CACHE_NAME = "flyword-cloud-tts-v2";
const TTS_CACHE_PREFIX = "https://flyword.local/tts-cache/";

type SpeechRequest = {
  provider: VoiceProviderId;
  input: string;
  voice: string;
  response_format: "mp3";
  speed: number;
};

function canUseCacheStorage(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

function cacheKeyForSpeech({ provider, input, voice, response_format, speed }: SpeechRequest): string {
  const params = new URLSearchParams({
    provider,
    input,
    voice,
    format: response_format,
    speed: String(speed),
  });
  return `${TTS_CACHE_PREFIX}?${params.toString()}`;
}

async function readCachedSpeech(request: SpeechRequest): Promise<Blob | null> {
  if (!canUseCacheStorage()) return null;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    const cached = await cache.match(cacheKeyForSpeech(request));
    return cached ? cached.blob() : null;
  } catch {
    return null;
  }
}

async function writeCachedSpeech(request: SpeechRequest, blob: Blob): Promise<void> {
  if (!canUseCacheStorage()) return;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    await cache.put(
      cacheKeyForSpeech(request),
      new Response(blob, {
        headers: {
          "Content-Type": blob.type || "audio/mpeg",
          "Cache-Control": "public, max-age=31536000",
        },
      }),
    );
  } catch {
    // Cache Storage can fail in private mode or when quota is exceeded.
  }
}

export async function getCloudSpeechBlob(
  input: string,
  speed: number,
  voice = "marin",
  provider: VoiceProviderId = "openai",
): Promise<{
  blob: Blob;
  fromCache: boolean;
}> {
  const normalizedSpeed = Math.max(0.25, Math.min(4, Number.isFinite(speed) ? speed : 1));
  const request: SpeechRequest = {
    provider,
    input,
    voice,
    response_format: "mp3",
    speed: normalizedSpeed,
  };

  const cached = await readCachedSpeech(request);
  if (cached) {
    return { blob: cached, fromCache: true };
  }

  const resp = await fetch("/api/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error?.message || `云端发音请求失败 (${resp.status})`);
  }

  const blob = await resp.blob();
  await writeCachedSpeech(request, blob);
  return { blob, fromCache: false };
}

export const getOpenAiSpeechBlob = getCloudSpeechBlob;
