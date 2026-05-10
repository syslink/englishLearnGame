import { normalizeText } from "./wordUtils";

const PHONETIC_CACHE_KEY = "flyword_phonetic_cache_v1";
const MAX_CACHE_ITEMS = 800;

type PhoneticRecord = {
  key: string;
  phonetic: string;
  updatedAt: number;
};

type PhoneticCacheMap = Record<string, PhoneticRecord>;

export function getPhoneticCacheKey(word: string): string {
  return normalizeText(word);
}

function readCache(): PhoneticCacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PHONETIC_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: PhoneticCacheMap): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.values(cache).sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed = entries.slice(0, MAX_CACHE_ITEMS);
    window.localStorage.setItem(
      PHONETIC_CACHE_KEY,
      JSON.stringify(Object.fromEntries(trimmed.map((item) => [item.key, item]))),
    );
  } catch {
    // Storage may be unavailable or full.
  }
}

export function readCachedPhonetics(words: string[]): Record<string, string> {
  const cache = readCache();
  const result: Record<string, string> = {};
  for (const word of words) {
    const key = getPhoneticCacheKey(word);
    const phonetic = cache[key]?.phonetic;
    if (phonetic) result[key] = phonetic;
  }
  return result;
}

export function writeCachedPhonetics(items: Record<string, string>): void {
  const cache = readCache();
  const now = Date.now();
  for (const [word, rawPhonetic] of Object.entries(items)) {
    const key = getPhoneticCacheKey(word);
    const phonetic = rawPhonetic.trim();
    if (!key || !phonetic) continue;
    cache[key] = { key, phonetic, updatedAt: now };
  }
  writeCache(cache);
}
