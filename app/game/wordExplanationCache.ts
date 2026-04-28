import type { CloudProviderId } from "./types";
import { normalizeText } from "./wordUtils";

const EXPLANATION_CACHE_KEY = "flyword_word_explanation_cache_v1";
const MAX_CACHE_ITEMS = 300;

type ExplanationCacheRecord = {
  key: string;
  explanation: string;
  updatedAt: number;
};

type ExplanationCacheMap = Record<string, ExplanationCacheRecord>;

export type ExplanationCacheSource =
  | { type: "cloud"; providerId: CloudProviderId; model: string }
  | { type: "local"; model: string };

function readCache(): ExplanationCacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXPLANATION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: ExplanationCacheMap): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.values(cache).sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed = entries.slice(0, MAX_CACHE_ITEMS);
    window.localStorage.setItem(
      EXPLANATION_CACHE_KEY,
      JSON.stringify(Object.fromEntries(trimmed.map((item) => [item.key, item]))),
    );
  } catch {
    // Storage may be unavailable or full.
  }
}

export function getExplanationCacheKey({
  en,
  zh,
  source,
}: {
  en: string;
  zh: string;
  source: ExplanationCacheSource;
}): string {
  const sourceKey =
    source.type === "cloud"
      ? `cloud:${source.providerId}:${source.model}`
      : `local:${source.model}`;
  return `${normalizeText(en)}|${zh.trim()}|${sourceKey}`;
}

export function readCachedExplanation(key: string): string | null {
  return readCache()[key]?.explanation || null;
}

export function writeCachedExplanation(key: string, explanation: string): void {
  const text = explanation.trim();
  if (!text) return;
  const cache = readCache();
  cache[key] = {
    key,
    explanation: text,
    updatedAt: Date.now(),
  };
  writeCache(cache);
}

