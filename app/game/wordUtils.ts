import type { LexiconItem, SpellChallengeMode, WordItem } from "./types";

export function shuffleString(str: string): string {
  const arr = str.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.join("");
  // If the shuffle didn't change it and it has >1 char, try again.
  if (result === str && str.length > 1) return shuffleString(str);
  return result;
}

export function createMissingLetterIndexes(word: string): number[] {
  const letterIndexes = Array.from(word)
    .map((ch, index) => (/^[a-zA-Z]$/.test(ch) ? index : -1))
    .filter((index) => index >= 0);
  if (!letterIndexes.length) return [];

  const missingCount =
    letterIndexes.length === 1
      ? 1
      : Math.max(1, Math.min(letterIndexes.length - 1, Math.round(letterIndexes.length * 0.5)));
  const shuffled = [...letterIndexes];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, missingCount).sort((a, b) => a - b);
}

export function getMissingLetterAnswer(word: string, indexes: number[]): string {
  return indexes.map((index) => word[index] || "").join("").toLowerCase();
}

export function getSpellChallengeInputLimit(word: WordItem): number {
  if (word.spellChallengeMode === "missing_letters") {
    return Array.from(word.en).filter((ch) => /^[a-zA-Z]$/.test(ch)).length;
  }
  return word.normalized.length;
}

export function getSpellChallengeAnswer(word: WordItem): string {
  if (word.spellChallengeMode === "missing_letters") {
    return Array.from(word.en)
      .filter((ch) => /^[a-zA-Z]$/.test(ch))
      .join("")
      .toLowerCase();
  }
  return word.normalized;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"`~()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function parseLexiconEntries(raw: string): LexiconItem[] {
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const result: LexiconItem[] = [];
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const en = line.slice(0, idx).trim();
    const zh = line.slice(idx + 1).trim();
    if (!en || !zh) continue;
    result.push({ en, zh });
  }
  return result;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getBatchId(entries: Array<{ en: string; zh: string }>): string {
  return entries
    .map((x) => `${normalizeText(x.en)}|${x.zh}`)
    .sort()
    .join("||");
}

export function parseWordList(raw: string, width: number): WordItem[] {
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const parsed: WordItem[] = [];

  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const en = line.slice(0, idx).trim();
    const zh = line.slice(idx + 1).trim();
    if (!en || !zh) continue;

    const laneCount = Math.min(8, Math.max(4, lines.length));
    const laneWidth = width / (laneCount + 1);
    const lane = (parsed.length % laneCount) + 1;
    const jitter = (Math.random() - 0.5) * Math.max(36, laneWidth * 0.35);
    const x = Math.max(12, Math.min(width - 140, lane * laneWidth + jitter));

    parsed.push({
      id: `${en}-${parsed.length}-${Date.now()}`,
      en,
      zh,
      normalized: normalizeText(en),
      revealedEn: true,
      x,
      vx: 0,
      y: -40 - Math.random() * 220,
      speed: 46 + Math.random() * 26,
      status: "live",
      exploding: false,
      shuffledEn: shuffleString(en.toLowerCase()),
      missingLetterIndexes: createMissingLetterIndexes(en),
      spellChallengeMode: "shuffle" satisfies SpellChallengeMode,
      spellUnlocked: false,
    });
  }

  return parsed;
}
