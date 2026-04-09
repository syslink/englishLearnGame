"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import categoriesData from "./categories.json";
import LlmChat from "./LlmChat";

type ScenarioItem = {
  id: number;
  scene: string;
  words: { word: string; meaning: string }[];
};

const SCENARIOS: ScenarioItem[] = categoriesData.scenarios;

type WordItem = {
  id: string;
  en: string;
  zh: string;
  normalized: string;
  revealedEn: boolean;
  x: number;
  vx: number;
  y: number;
  speed: number;
  status: "live" | "hit" | "missed";
  exploding: boolean;
  shuffledEn: string;
  spellUnlocked: boolean;
};

type LikeBurst = {
  id: string;
  left: number;
  top: number;
  size: number;
};

type MistakeRecord = {
  key: string;
  en: string;
  zh: string;
  count: number;
};

type StudyHistoryRecord = {
  key: string;
  en: string;
  zh: string;
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  lastStudiedAt: number;
};

type StudyBatchRecord = {
  id: string;
  words: string[];
  wordCount: number;
  playCount: number;
  correctCount: number;
  wrongCount: number;
  createdAt: number;
  lastPlayedAt: number;
};

type GameState = "idle" | "running" | "ended";
type PlayMode = "voice_match" | "plane_shooter" | "spell_word";

type Bullet = {
  id: string;
  x: number;
  y: number;
  speed: number;
  targetId: string;
};

type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  grammars?: unknown;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechGrammarList?: new () => {
      addFromString: (grammar: string, weight?: number) => void;
    };
    webkitSpeechGrammarList?: new () => {
      addFromString: (grammar: string, weight?: number) => void;
    };
  }
}

const DEFAULT_WORDS = `apple=苹果
book=书
run=跑步
turn on=打开
make up=编造
look after=照顾`;

type Difficulty = "easy" | "medium" | "hard";
type LexiconItem = { en: string; zh: string };

const WORD_BANK: Record<Difficulty, LexiconItem[]> = {
  easy: [
    { en: "apple", zh: "苹果" },
    { en: "banana", zh: "香蕉" },
    { en: "book", zh: "书" },
    { en: "water", zh: "水" },
    { en: "school", zh: "学校" },
    { en: "family", zh: "家庭" },
    { en: "friend", zh: "朋友" },
    { en: "happy", zh: "开心的" },
    { en: "small", zh: "小的" },
    { en: "big", zh: "大的" },
    { en: "open", zh: "打开" },
    { en: "close", zh: "关闭" },
    { en: "morning", zh: "早上" },
    { en: "night", zh: "夜晚" },
    { en: "yellow", zh: "黄色" },
    { en: "teacher", zh: "老师" },
    { en: "student", zh: "学生" },
    { en: "window", zh: "窗户" },
    { en: "music", zh: "音乐" },
    { en: "breakfast", zh: "早餐" },
  ],
  medium: [
    { en: "take off", zh: "脱下；起飞" },
    { en: "look after", zh: "照顾" },
    { en: "turn on", zh: "打开" },
    { en: "turn off", zh: "关闭" },
    { en: "make sure", zh: "确保" },
    { en: "for example", zh: "例如" },
    { en: "arrive at", zh: "到达" },
    { en: "be interested in", zh: "对...感兴趣" },
    { en: "in front of", zh: "在...前面" },
    { en: "as soon as", zh: "一...就..." },
    { en: "write down", zh: "记下" },
    { en: "grow up", zh: "长大" },
    { en: "on time", zh: "准时" },
    { en: "at least", zh: "至少" },
    { en: "in fact", zh: "事实上" },
    { en: "in the end", zh: "最后" },
    { en: "take care of", zh: "照顾" },
    { en: "find out", zh: "查明" },
    { en: "give up", zh: "放弃" },
    { en: "make up", zh: "编造；化妆" },
  ],
  hard: [
    { en: "inevitable", zh: "不可避免的" },
    { en: "sustainable", zh: "可持续的" },
    { en: "nevertheless", zh: "然而；不过" },
    { en: "approximately", zh: "大约" },
    { en: "consequence", zh: "结果；后果" },
    { en: "prioritize", zh: "优先处理" },
    { en: "collaboration", zh: "协作" },
    { en: "misunderstanding", zh: "误解" },
    { en: "significantly", zh: "显著地" },
    { en: "interpretation", zh: "解释；理解" },
    { en: "be capable of", zh: "能够..." },
    { en: "in terms of", zh: "就...而言" },
    { en: "with regard to", zh: "关于..." },
    { en: "by no means", zh: "绝不" },
    { en: "take into account", zh: "把...考虑在内" },
    { en: "it is worth noting that", zh: "值得注意的是" },
    { en: "from my perspective", zh: "从我的角度看" },
    { en: "play a crucial role in", zh: "在...中起关键作用" },
    { en: "there is no denying that", zh: "不可否认的是" },
    { en: "in the long run", zh: "从长远来看" },
  ],
};

const ROUND_MS = 30000;
const STUDY_HISTORY_STORAGE_KEY = "english_voice_game_study_history_v1";
const STUDY_BATCH_STORAGE_KEY = "english_voice_game_study_batch_v1";

function shuffleString(str: string): string {
  const arr = str.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.join("");
  // If the shuffle didn't change it and it has >1 char, try again
  if (result === str && str.length > 1) return shuffleString(str);
  return result;
}

function normalizeText(text: string): string {
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

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function parseLexiconEntries(raw: string): LexiconItem[] {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBatchId(entries: Array<{ en: string; zh: string }>): string {
  return entries
    .map((x) => `${normalizeText(x.en)}|${x.zh}`)
    .sort()
    .join("||");
}

function parseWordList(raw: string, width: number): WordItem[] {
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
      spellUnlocked: false,
    });
  }

  return parsed;
}

export default function HomePage() {
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const roundDurationRef = useRef(ROUND_MS);

  const [wordInput, setWordInput] = useState(DEFAULT_WORDS);
  const [words, setWords] = useState<WordItem[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>("plane_shooter");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [planeTargetId, setPlaneTargetId] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState("");
  const [countdownMs, setCountdownMs] = useState(ROUND_MS);
  const [roundSeconds, setRoundSeconds] = useState(30);
  const [fallHeightPx] = useState(600);
  const [planeDropChineseOnly, setPlaneDropChineseOnly] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [generateCount, setGenerateCount] = useState(8);
  const [totalCount, setTotalCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [, setSpeechSupported] = useState(true);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeBoost, setTimeBoost] = useState(0);
  const [, setFeedbackText] = useState("准备好开口说英语了吗？");
  const [likeBursts, setLikeBursts] = useState<LikeBurst[]>([]);
  const [mistakeMap, setMistakeMap] = useState<Record<string, MistakeRecord>>({});
  const [studyHistoryMap, setStudyHistoryMap] = useState<Record<string, StudyHistoryRecord>>({});
  const [studyBatchMap, setStudyBatchMap] = useState<Record<string, StudyBatchRecord>>({});
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [planeX, setPlaneX] = useState(240);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [shooterHits, setShooterHits] = useState(0);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [startAfterOpen, setStartAfterOpen] = useState(false);
  // ---- WebLLM 本地大模型 ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [llmEngine, setLlmEngine] = useState<any>(null);
  const [llmStatus, setLlmStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [llmProgress, setLlmProgress] = useState("");
  const [llmModelId, setLlmModelId] = useState("");
  const [llmAvailableModels, setLlmAvailableModels] = useState<{ id: string; size: string; cached?: boolean }[]>([]);
  const [llmGenerating, setLlmGenerating] = useState(false);
  const [llmTopic, setLlmTopic] = useState("");
  const [llmChatOpen, setLlmChatOpen] = useState(false);
  const [llmModelFilter, setLlmModelFilter] = useState("");
  // ---- 拼单词模式 ----
  const [spellInput, setSpellInput] = useState<string[]>([]);
  const [spellTargetId, setSpellTargetId] = useState<string | null>(null);
  const [llmDropdownOpen, setLlmDropdownOpen] = useState(false);
  const llmDropdownRef = useRef<HTMLDivElement>(null);

  const wordsRef = useRef<WordItem[]>([]);
  const playModeRef = useRef<PlayMode>("plane_shooter");
  const planeXRef = useRef(240);
  const planeTargetIdRef = useRef<string | null>(null);
  const planeMoveDirRef = useRef<-1 | 0 | 1>(0);
  const leftPressedRef = useRef(false);
  const rightPressedRef = useRef(false);
  const lastFireTsRef = useRef(0);
  const fallHeightRef = useRef(600);
  const roundStartRef = useRef(0);
  const lastFrameTsRef = useRef<number | null>(null);
  const ttsTimerRef = useRef<number | null>(null);
  const currentBatchIdRef = useRef<string | null>(null);
  const askingRef = useRef(false);
  const targetRef = useRef<string | null>(null);
  const spaceHoldRef = useRef(false);
  const [, setIsHoldingSpace] = useState(false);
  const spellTargetIdRef = useRef<string | null>(null);

  const currentMeaning = useMemo(() => {
    if (!targetId) return gameState === "running" ? "准备下一题..." : "点击开始游戏";
    const target = words.find((w) => w.id === targetId);
    return target?.zh || "准备下一题...";
  }, [words, targetId, gameState]);

  const lexiconLabels = useMemo(() => parseLexiconEntries(wordInput), [wordInput]);
  const mistakeList = useMemo(
    () => Object.values(mistakeMap).sort((a, b) => b.count - a.count),
    [mistakeMap],
  );
  const studyBatchList = useMemo(
    () =>
      Object.values(studyBatchMap).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt),
    [studyBatchMap],
  );

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  useEffect(() => {
    planeXRef.current = planeX;
  }, [planeX]);

  useEffect(() => {
    planeTargetIdRef.current = planeTargetId;
  }, [planeTargetId]);

  useEffect(() => {
    fallHeightRef.current = fallHeightPx;
  }, [fallHeightPx]);

  // 加载 WebLLM 可用模型列表
  useEffect(() => {
    import("@mlc-ai/web-llm").then(async ({ prebuiltAppConfig, hasModelInCache }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = (prebuiltAppConfig.model_list as any[])
        .filter((m) => !m.model_type) // 排除 VLM 等非文本模型
        .sort((a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0))
        .map((m) => ({
          id: m.model_id as string,
          size: m.vram_required_MB ? `${(m.vram_required_MB / 1024).toFixed(1)}GB` : "",
          lowRes: !!m.low_resource_required,
        }));
      if (all.length) {
        // 先设置列表（无缓存标记）
        setLlmAvailableModels(all.map((m) => ({ id: m.id, size: m.size })));
        const defaultModel = all.find((m) => m.lowRes) || all[0];
        setLlmModelId(defaultModel.id);

        // 异步检测哪些模型已缓存
        const cacheResults = await Promise.all(
          all.map(async (m) => {
            try {
              const cached = await hasModelInCache(m.id);
              return { id: m.id, size: m.size, cached };
            } catch {
              return { id: m.id, size: m.size, cached: false };
            }
          })
        );
        setLlmAvailableModels(cacheResults);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STUDY_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, StudyHistoryRecord>;
      if (parsed && typeof parsed === "object") {
        setStudyHistoryMap(parsed);
      }
    } catch {
      // ignore corrupted local cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STUDY_BATCH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, StudyBatchRecord>;
      if (parsed && typeof parsed === "object") {
        setStudyBatchMap(parsed);
      }
    } catch {
      // ignore corrupted local cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STUDY_HISTORY_STORAGE_KEY,
        JSON.stringify(studyHistoryMap),
      );
    } catch {
      // ignore persistence errors
    }
  }, [studyHistoryMap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STUDY_BATCH_STORAGE_KEY,
        JSON.stringify(studyBatchMap),
      );
    } catch {
      // ignore persistence errors
    }
  }, [studyBatchMap]);

  const bumpStudyHistory = useCallback(
    (word: { en: string; zh: string }, mode: "seen" | "correct" | "wrong") => {
      const key = `${normalizeText(word.en)}|${word.zh}`;
      const now = Date.now();
      setStudyHistoryMap((prev) => {
        const existing = prev[key];
        const base: StudyHistoryRecord = existing || {
          key,
          en: word.en,
          zh: word.zh,
          seenCount: 0,
          correctCount: 0,
          wrongCount: 0,
          lastStudiedAt: now,
        };
        const next: StudyHistoryRecord = {
          ...base,
          en: word.en,
          zh: word.zh,
          lastStudiedAt: now,
        };
        if (mode === "seen") next.seenCount += 1;
        if (mode === "correct") next.correctCount += 1;
        if (mode === "wrong") next.wrongCount += 1;
        return { ...prev, [key]: next };
      });
    },
    [],
  );

  const addSeenHistoryBatch = useCallback(
    (entries: Array<{ en: string; zh: string }>) => {
      const unique = new Map<string, { en: string; zh: string }>();
      for (const item of entries) {
        unique.set(`${normalizeText(item.en)}|${item.zh}`, item);
      }
      unique.forEach((item) => bumpStudyHistory(item, "seen"));
    },
    [bumpStudyHistory],
  );

  const registerStudyBatch = useCallback(
    (entries: Array<{ en: string; zh: string }>) => {
      const unique = new Map<string, { en: string; zh: string }>();
      for (const item of entries) {
        unique.set(`${normalizeText(item.en)}|${item.zh}`, item);
      }
      const normalized = Array.from(unique.values());
      const id = getBatchId(normalized);
      const now = Date.now();
      const words = normalized.map((x) => `${x.en}=${x.zh}`);
      currentBatchIdRef.current = id;
      setStudyBatchMap((prev) => {
        const existing = prev[id];
        if (!existing) {
          return {
            ...prev,
            [id]: {
              id,
              words,
              wordCount: words.length,
              playCount: 1,
              correctCount: 0,
              wrongCount: 0,
              createdAt: now,
              lastPlayedAt: now,
            },
          };
        }
        return {
          ...prev,
          [id]: {
            ...existing,
            words,
            wordCount: words.length,
            playCount: existing.playCount + 1,
            lastPlayedAt: now,
          },
        };
      });
    },
    [],
  );

  const bumpBatchResult = useCallback((mode: "correct" | "wrong") => {
    const id = currentBatchIdRef.current;
    if (!id) return;
    setStudyBatchMap((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return {
        ...prev,
        [id]: {
          ...existing,
          correctCount:
            mode === "correct" ? existing.correctCount + 1 : existing.correctCount,
          wrongCount:
            mode === "wrong" ? existing.wrongCount + 1 : existing.wrongCount,
          lastPlayedAt: Date.now(),
        },
      };
    });
  }, []);

  const emitLikeBurst = useCallback(() => {
    const area = gameAreaRef.current;
    if (!area) return;
    const width = area.clientWidth;
    const height = area.clientHeight;
    const centerX = Math.max(24, Math.min(width - 24, width * (0.25 + Math.random() * 0.5)));
    const centerY = Math.max(28, Math.min(height - 28, height * (0.28 + Math.random() * 0.44)));

    const burst: LikeBurst[] = Array.from({ length: 7 }, (_, i) => ({
      id: `${Date.now()}-${i}-${Math.random()}`,
      left: centerX + (Math.random() - 0.5) * 120,
      top: centerY + (Math.random() - 0.5) * 80,
      size: 18 + Math.round(Math.random() * 14),
    }));

    setLikeBursts((prev) => [...prev, ...burst]);
    window.setTimeout(() => {
      const ids = new Set(burst.map((b) => b.id));
      setLikeBursts((prev) => prev.filter((b) => !ids.has(b.id)));
    }, 850);
  }, []);

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;

    const speakNow = () => {
      const utter = new SpeechSynthesisUtterance(`${text.trim()}.`);
      const selectedVoice = ttsVoices.find((v) => v.voiceURI === selectedVoiceURI);
      if (selectedVoice) {
        utter.voice = selectedVoice;
        utter.lang = selectedVoice.lang || "en-US";
      } else {
        utter.lang = "en-US";
      }
      utter.rate = 0.86;
      utter.pitch = 1;
      utter.volume = 1;
      utter.onerror = () => {
        setFeedbackText("当前发音引擎异常，请更换发音人后重试");
      };
      synth.speak(utter);
    };

    if (ttsTimerRef.current) {
      window.clearTimeout(ttsTimerRef.current);
      ttsTimerRef.current = null;
    }

    // 避免连续 cancel/speak 触发浏览器 TTS 卡喉问题。
    if (synth.speaking || synth.pending) {
      synth.cancel();
      ttsTimerRef.current = window.setTimeout(() => {
        synth.resume();
        speakNow();
      }, 120);
      return;
    }

    synth.resume();
    speakNow();
  }, [selectedVoiceURI, ttsVoices]);

  const lockPlaneTarget = useCallback((target: WordItem) => {
    setWords((prev) => {
      const updated = prev.map((w) =>
        w.id === target.id ? { ...w, revealedEn: true } : w,
      );
      wordsRef.current = updated;
      return updated;
    });
    setPlaneTargetId(target.id);
    planeTargetIdRef.current = target.id;
    setFeedbackText(`已锁定红色目标：${target.en}。左右键移动，上方向键发射`);
  }, []);

  const clearPlaneTarget = useCallback(() => {
    setPlaneTargetId(null);
    planeTargetIdRef.current = null;
  }, []);

  const hitPlaneTarget = useCallback((targetIdToHit: string): boolean => {
    const hitWord = wordsRef.current.find((w) => w.id === targetIdToHit && w.status === "live");
    if (!hitWord) return false;

    setWords((old) => {
      let didHit = false;
      const updated: WordItem[] = old.map((w) => {
        if (w.id === targetIdToHit && w.status === "live") {
          didHit = true;
          return { ...w, status: "hit" as const, exploding: true };
        }
        return w;
      });
      if (!didHit) return old;
      wordsRef.current = updated;
      return updated;
    });

    window.setTimeout(() => {
      setWords((old) => {
        const updated: WordItem[] = old.map((w) =>
          w.id === targetIdToHit ? { ...w, exploding: false } : w,
        );
        wordsRef.current = updated;
        return updated;
      });
    }, 360);

    if (planeTargetIdRef.current === targetIdToHit) {
      clearPlaneTarget();
    }
    emitLikeBurst();
    bumpStudyHistory({ en: hitWord.en, zh: hitWord.zh }, "correct");
    bumpBatchResult("correct");
    setShooterHits((v) => v + 1);
    setDoneCount((v) => v + 1);
    setFeedbackText(`命中 ${hitWord.en}！继续语音锁定下一个红色目标`);
    return true;
  }, [bumpBatchResult, bumpStudyHistory, clearPlaneTarget, emitLikeBurst]);

  const firePlaneBullet = useCallback(() => {
    if (playModeRef.current !== "plane_shooter" || gameState !== "running") return;
    if (!gameAreaRef.current) return;

    const currentTargetId = planeTargetIdRef.current;
    if (!currentTargetId) {
      setFeedbackText("请先按住空格说出单词，锁定红色目标");
      return;
    }
    const targetAlive = wordsRef.current.some(
      (w) => w.id === currentTargetId && w.status === "live",
    );
    if (!targetAlive) {
      clearPlaneTarget();
      setFeedbackText("目标已消失，请重新语音锁定");
      return;
    }

    const now = performance.now();
    if (now - lastFireTsRef.current < 140) return;
    lastFireTsRef.current = now;

    const areaH = gameAreaRef.current.clientHeight;
    setBullets((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        x: planeXRef.current,
        y: areaH - 34,
        speed: 900,
        targetId: currentTargetId,
      },
    ]);
  }, [clearPlaneTarget, gameState]);

  // ---- 拼单词模式：选择下一个目标 ----
  const pickNextSpellTarget = useCallback((wordList?: WordItem[]) => {
    const list = wordList || wordsRef.current;
    // Pick the lowest live, non-unlocked word (closest to bottom = most urgent)
    const candidates = list.filter((w) => w.status === "live" && !w.spellUnlocked);
    if (!candidates.length) {
      setSpellTargetId(null);
      spellTargetIdRef.current = null;
      setSpellInput([]);
      return;
    }
    // Pick the one with highest y (closest to falling out)
    const next = candidates.reduce((a, b) => (a.y > b.y ? a : b));
    setSpellTargetId(next.id);
    spellTargetIdRef.current = next.id;
    setSpellInput([]);
  }, []);

  // ---- 拼单词模式：确认拼写 ----
  const confirmSpell = useCallback(() => {
    const tid = spellTargetIdRef.current;
    if (!tid) return;
    const target = wordsRef.current.find((w) => w.id === tid && w.status === "live");
    if (!target) { pickNextSpellTarget(); return; }

    const typed = spellInput.join("").toLowerCase();
    const correct = target.normalized.replace(/\s+/g, "");

    if (typed === correct) {
      // Correct → explode immediately
      setWords((prev) => {
        const updated = prev.map((w) =>
          w.id === tid ? { ...w, status: "hit" as const, exploding: true, revealedEn: true } : w
        );
        wordsRef.current = updated;
        return updated;
      });
      // Remove explosion after animation
      setTimeout(() => {
        setWords((prev) => {
          const updated = prev.map((w) =>
            w.id === tid ? { ...w, exploding: false } : w
          );
          wordsRef.current = updated;
          return updated;
        });
      }, 360);
      emitLikeBurst();
      bumpStudyHistory({ en: target.en, zh: target.zh }, "correct");
      bumpBatchResult("correct");
      setShooterHits((v) => v + 1);
      setDoneCount((v) => v + 1);
      setSpellInput([]);
      setTimeout(() => pickNextSpellTarget(), 300);
    } else {
      // Wrong: count as error, shake feedback, clear input
      setFeedbackText(`拼写错误！正确: ${target.en}`);
      const key = `${target.normalized}|${target.zh}`;
      setMistakeMap((prevMap) => {
        const existing = prevMap[key];
        return {
          ...prevMap,
          [key]: { key, en: target.en, zh: target.zh, count: (existing?.count || 0) + 1 },
        };
      });
      setSpellInput([]);
    }
  }, [spellInput, pickNextSpellTarget, emitLikeBurst, bumpStudyHistory, bumpBatchResult]);

  const stopSpeech = useCallback(() => {
    const rec = speechRef.current;
    if (!rec) return;

    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;

    try {
      rec.stop();
    } catch {
      // ignore
    }

    speechRef.current = null;
  }, []);

  const clearRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const chooseNextTarget = useCallback((items: WordItem[]): string | null => {
    const remaining = items.filter((w) => w.status === "live");
    if (!remaining.length) return null;
    return remaining[Math.floor(Math.random() * remaining.length)].id;
  }, []);

  const nextRound = useCallback(
    (items: WordItem[]) => {
      const nextId = chooseNextTarget(items);
      setTargetId(nextId);
      targetRef.current = nextId;
      askingRef.current = Boolean(nextId);
      roundStartRef.current = performance.now();
      const durationMs = roundSeconds * 1000;
      roundDurationRef.current = durationMs;
      setCountdownMs(durationMs);
      setRecognizedText(nextId ? "按住空格开始监听..." : "");

      if (nextId) {
        setFeedbackText("按住空格说英文，松开停止监听");
      } else {
        setGameState("ended");
        setFeedbackText("本局结束，看看你的连击记录吧");
        stopSpeech();
      }
    },
    [chooseNextTarget, roundSeconds, stopSpeech],
  );

  const resolveRound = useCallback(
    (type: "correct" | "timeout" | "miss") => {
      const id = targetRef.current;
      if (!id || !askingRef.current) return;
      const failedWord = words.find((w) => w.id === id);

      askingRef.current = false;
      targetRef.current = null;
      spaceHoldRef.current = false;
      setIsHoldingSpace(false);
      setTargetId(null);
      stopSpeech();

      setWords((prev) => {
        const updated: WordItem[] = prev.map((w) => {
          if (w.id !== id) return w;

          if (type === "correct") {
            return { ...w, status: "hit" as const, exploding: true };
          }

          return { ...w, status: "missed" as const };
        });

        setTimeout(() => {
          setWords((inner) =>
            inner.map((w) => (w.id === id ? { ...w, exploding: false } : w)),
          );
        }, 360);

        setTimeout(() => nextRound(updated), 320);
        return updated;
      });

      setDoneCount((v) => v + 1);

      if (type === "correct") {
        bumpBatchResult("correct");
        if (failedWord) {
          bumpStudyHistory({ en: failedWord.en, zh: failedWord.zh }, "correct");
        }
        setCorrectCount((v) => v + 1);
        setStreak((prev) => {
          const next = prev + 1;
          setBestStreak((best) => Math.max(best, next));
          emitLikeBurst();
          if (next > 0 && next % 3 === 0) {
            setTimeBoost((t) => t + 1);
            setFeedbackText(`连击 ${next}！奖励 1 次“+1秒加时”`);
          } else {
            setFeedbackText(`Nice! 连击 ${next}`);
          }
          return next;
        });
      } else {
        bumpBatchResult("wrong");
        setStreak(0);
        if (failedWord) {
          bumpStudyHistory({ en: failedWord.en, zh: failedWord.zh }, "wrong");
          const key = `${normalizeText(failedWord.en)}|${failedWord.zh}`;
          setMistakeMap((prev) => {
            const existing = prev[key];
            return {
              ...prev,
              [key]: {
                key,
                en: failedWord.en,
                zh: failedWord.zh,
                count: (existing?.count || 0) + 1,
              },
            };
          });
        }
        setFeedbackText(type === "timeout" ? "超时了，下一题继续" : "掉到底部了，别灰心");
      }
    },
    [bumpBatchResult, bumpStudyHistory, emitLikeBurst, nextRound, stopSpeech, words],
  );

  const tryMatchSpeech = useCallback(
    (raw: string) => {
      if (!raw) return;

      setRecognizedText(`识别结果：${raw}`);
      const normalized = normalizeText(raw);
      const liveWords = wordsRef.current;
      const candidates = liveWords.filter((w) => w.status === "live");
      if (!candidates.length) return;

      if (playMode === "plane_shooter") {
        let bestShooter: { word: WordItem; score: number } | null = null;
        for (const c of candidates) {
          const score = similarity(normalized, c.normalized);
          if (!bestShooter || score > bestShooter.score) {
            bestShooter = { word: c, score };
          }
        }
        if (!bestShooter) return;
        // 飞机模式用更宽容的判定，提升真实语音场景可触发率。
        const containsCandidate = candidates.find(
          (c) =>
            normalized.includes(c.normalized) ||
            c.normalized.includes(normalized),
        );
        if (containsCandidate) {
          lockPlaneTarget(containsCandidate);
          return;
        }

        if (bestShooter.score >= 0.58) {
          lockPlaneTarget(bestShooter.word);
          return;
        }

        setFeedbackText(`未匹配到下落词，最接近：${bestShooter.word.en}`);
        return;
      }

      const currentId = targetRef.current;
      if (!currentId) return;

      const target = liveWords.find((w) => w.id === currentId);
      if (!target) return;

      // 与飞机模式保持一致：先包含匹配，再宽松相似度匹配。
      const containsCandidate = candidates.find(
        (c) => normalized.includes(c.normalized) || c.normalized.includes(normalized),
      );

      let best: { word: WordItem; score: number } | null = null;
      for (const c of candidates) {
        const score = similarity(normalized, c.normalized);
        if (!best || score > best.score) {
          best = { word: c, score };
        }
      }

      const matchedWord =
        containsCandidate || (best && best.score >= 0.58 ? best.word : null);

      if (!matchedWord) {
        if (best) {
          setFeedbackText(`未识别到有效词，最接近：${best.word.en}`);
        }
        return;
      }

      if (matchedWord.id === target.id) {
        resolveRound("correct");
      } else {
        setFeedbackText(`你说的是 "${matchedWord.en}"，本题目标是 "${target.en}"`);
      }
    },
    [lockPlaneTarget, playMode, resolveRound],
  );

  // ---- WebLLM: 加载模型 ----
  const loadLlmModel = useCallback(async () => {
    if (!llmModelId || llmStatus === "loading") return;
    setLlmStatus("loading");
    setLlmProgress("正在初始化...");
    try {
      const { CreateMLCEngine, prebuiltAppConfig } = await import("@mlc-ai/web-llm");
      // 通过本地 API 代理下载模型，避免 CORS 和网络问题
      const origin = window.location.origin;
      const mirrorAppConfig = {
        ...prebuiltAppConfig,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model_list: (prebuiltAppConfig.model_list as any[]).map((m) => ({
          ...m,
          model: typeof m.model === "string"
            ? m.model.replace("https://huggingface.co", `${origin}/api/hf-proxy`)
            : m.model,
          model_lib: typeof m.model_lib === "string"
            ? m.model_lib.replace("https://raw.githubusercontent.com", `${origin}/api/gh-proxy`)
            : m.model_lib,
        })),
      };
      const engine = await CreateMLCEngine(llmModelId, {
        appConfig: mirrorAppConfig,
        initProgressCallback: (progress) => {
          setLlmProgress(progress.text || "加载中...");
        },
      });
      setLlmEngine(engine);
      setLlmStatus("ready");
      setLlmProgress("");
    } catch (err) {
      console.error("WebLLM load failed:", err);
      setLlmStatus("error");
      setLlmProgress(`加载失败: ${err}`);
    }
  }, [llmModelId, llmStatus]);

  // 选中已缓存模型时自动加载
  const selectedModelCached = llmAvailableModels.find((m) => m.id === llmModelId)?.cached;
  const prevModelIdRef = useRef(llmModelId);
  useEffect(() => {
    if (llmModelId && llmModelId !== prevModelIdRef.current) {
      prevModelIdRef.current = llmModelId;
      const m = llmAvailableModels.find((x) => x.id === llmModelId);
      if (m?.cached && llmStatus !== "loading") {
        loadLlmModel();
      }
    }
  }, [llmModelId, llmAvailableModels, llmStatus, loadLlmModel]);

  // 点击外部关闭模型下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (llmDropdownRef.current && !llmDropdownRef.current.contains(e.target as Node)) {
        setLlmDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredLlmModels = llmAvailableModels.filter((m) =>
    m.id.toLowerCase().includes(llmModelFilter.toLowerCase())
  );

  // 用 LLM 生成词库
  const generateWordsWithLlm = useCallback(async () => {
    if (!llmEngine || llmGenerating) return;
    const topic = llmTopic.trim() || "日常生活";
    setLlmGenerating(true);
    try {
      const response = await llmEngine.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are an English vocabulary generator. Output ONLY lines in the format: english=中文翻译\nNo numbering, no extra text. Generate 10 useful English words or phrases for the given topic.",
          },
          {
            role: "user",
            content: `Topic: ${topic}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 300,
      });
      const text = response.choices?.[0]?.message?.content?.trim() || "";
      if (text) {
        // 提取 xxx=xxx 格式的行
        const lines = text
          .split("\n")
          .map((l: string) => l.replace(/^\d+[\.\)]\s*/, "").trim())
          .filter((l: string) => l.includes("="));
        if (lines.length > 0) {
          setWordInput((prev) => {
            const existing = prev.trim();
            return existing ? `${existing}\n${lines.join("\n")}` : lines.join("\n");
          });
        }
      }
    } catch (err) {
      console.error("LLM generation failed:", err);
    } finally {
      setLlmGenerating(false);
    }
  }, [llmEngine, llmGenerating, llmTopic]);

  const startSpeech = useCallback(() => {
    stopSpeech();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    // 受限识别：注入当前候选词，降低跑偏概率。
    const liveWords = wordsRef.current;
    const focusId =
      playModeRef.current === "plane_shooter" ? planeTargetIdRef.current : targetRef.current;
    const target = liveWords.find((w) => w.id === focusId);
    const live = liveWords.filter((w) => w.status === "live");
    const grammarTerms = [
      ...live.map((w) => w.en),
      ...(target ? [target.en, target.en, target.en] : []),
    ];
    const GrammarList =
      window.SpeechGrammarList || window.webkitSpeechGrammarList;
    if (GrammarList && grammarTerms.length > 0) {
      try {
        const grammarList = new GrammarList();
        const escaped = grammarTerms
          .map((term) => term.toLowerCase().replace(/[;=|]/g, " "))
          .join(" | ");
        grammarList.addFromString(`#JSGF V1.0; grammar words; public <word> = ${escaped} ;`, 1);
        rec.grammars = grammarList;
      } catch {
        // 部分浏览器会忽略 grammar，直接降级继续。
      }
    }

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript?.trim() || "";
      if (!transcript) return;
      tryMatchSpeech(transcript);
    };

    rec.onerror = () => {
      // 浏览器可能因为权限或设备问题报错，继续依赖倒计时机制。
    };

    rec.onend = () => {
      if (gameState === "running" && askingRef.current && spaceHoldRef.current) {
        try {
          rec.start();
        } catch {
          // ignore
        }
      }
    };

    try {
      rec.start();
      speechRef.current = rec;
      setRecognizedText("正在监听...（按住空格）");
    } catch {
      setSpeechSupported(false);
    }
  }, [gameState, stopSpeech, tryMatchSpeech]);

  const endGame = useCallback(() => {
    setGameState("ended");
    setTargetId(null);
    setPlaneTargetId(null);
    targetRef.current = null;
    planeTargetIdRef.current = null;
    askingRef.current = false;
    spaceHoldRef.current = false;
    planeMoveDirRef.current = 0;
    leftPressedRef.current = false;
    rightPressedRef.current = false;
    lastFireTsRef.current = 0;
    setIsHoldingSpace(false);
    setRecognizedText("");
    setCountdownMs(0);
    setBullets([]);
    setSpellTargetId(null);
    spellTargetIdRef.current = null;
    setSpellInput([]);
    currentBatchIdRef.current = null;
    lastFrameTsRef.current = null;
    clearRaf();
    stopSpeech();
  }, [clearRaf, stopSpeech]);

  const useTimeBoost = useCallback(() => {
    if (playMode !== "voice_match") return;
    if (gameState !== "running" || !askingRef.current || timeBoost <= 0) return;
    roundStartRef.current += 1000;
    setTimeBoost((v) => Math.max(0, v - 1));
    setFeedbackText("加时成功：本题剩余时间 +1 秒");
  }, [playMode, gameState, timeBoost]);

  const generateByDifficulty = useCallback(() => {
    const bank = WORD_BANK[difficulty];
    if (!bank.length) return;

    const maxAllowed = bank.length;
    const safeCount = Math.max(3, Math.min(maxAllowed, Math.floor(generateCount)));
    if (safeCount !== generateCount) {
      setGenerateCount(safeCount);
    }

    const shuffled = [...bank];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const picked = shuffled
      .slice(0, safeCount)
      .map((item) => `${item.en}=${item.zh}`)
      .join("\n");

    setWordInput(picked);
    setFeedbackText(`已生成 ${safeCount} 条${difficulty === "easy" ? "初级" : difficulty === "medium" ? "中级" : "高级"}词条`);
  }, [difficulty, generateCount]);

  const loadScenario = useCallback((scenarioId: number) => {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const lines = scenario.words.map((w) => `${w.word}=${w.meaning}`).join("\n");
    setWordInput(lines);
    setFeedbackText(`已载入场景「${scenario.scene}」，共 ${scenario.words.length} 个词条`);
  }, []);

  const loadMistakePractice = useCallback(() => {
    if (!mistakeList.length) return;
    const lines = mistakeList.map((m) => `${m.en}=${m.zh}`).join("\n");
    setWordInput(lines);
    setFeedbackText(`已载入 ${mistakeList.length} 条错题词库，可直接开始专项练习`);
  }, [mistakeList]);

  const loadBatchPractice = useCallback(
    (batchId: string) => {
      const batch = studyBatchMap[batchId];
      if (!batch) return;
      setWordInput(batch.words.join("\n"));
      setFeedbackText(`已载入批次词库（${batch.wordCount}词，可直接复习）`);
    },
    [studyBatchMap],
  );

  const gameLoop = useCallback(
    (now: number) => {
      const prevTs = lastFrameTsRef.current;
      const deltaSec = prevTs ? Math.max(0, Math.min(0.05, (now - prevTs) / 1000)) : 1 / 60;
      lastFrameTsRef.current = now;
      const mode = playModeRef.current;

      if (mode === "plane_shooter") {
        const areaW = gameAreaRef.current?.clientWidth ?? 900;
        const nextPlaneX = clamp(
          planeXRef.current + planeMoveDirRef.current * 560 * deltaSec,
          24,
          Math.max(24, areaW - 24),
        );
        if (Math.abs(nextPlaneX - planeXRef.current) > 0.1) {
          planeXRef.current = nextPlaneX;
          setPlaneX(nextPlaneX);
        }

        setBullets((prev) => {
          const resolvedHits = new Set<string>();
          const moved: Bullet[] = [];
          for (const b of prev) {
            const ny = b.y - b.speed * deltaSec;
            if (ny < -28) continue;

            const isCurrentRedTarget = b.targetId === planeTargetIdRef.current;
            const target = wordsRef.current.find((w) => w.id === b.targetId && w.status === "live");
            if (!isCurrentRedTarget || !target) {
              moved.push({ ...b, y: ny });
              continue;
            }

            const targetCenterX = target.x + 44;
            const targetCenterY = target.y + 14;
            const isHit =
              Math.abs(b.x - targetCenterX) <= 48 &&
              Math.abs(ny - targetCenterY) <= 24;

            if (isHit) {
              if (!resolvedHits.has(b.targetId)) {
                resolvedHits.add(b.targetId);
                hitPlaneTarget(b.targetId);
              }
              continue;
            }

            moved.push({ ...b, y: ny });
          }
          return moved;
        });
      }

      setWords((prev) => {
        let hasLive = false;
        let targetDropped = false;

        const updated: WordItem[] = prev.map((w) => {
          if (w.status !== "live") return w;

          let nextX = w.x + w.vx * deltaSec;
          const areaW = gameAreaRef.current?.clientWidth ?? 900;
          let nextVx = w.vx;
          if (mode === "plane_shooter" || mode === "spell_word") {
            if (nextX < 4) {
              nextX = 4;
              nextVx = Math.abs(nextVx || 40);
            } else if (nextX > areaW - 90) {
              nextX = areaW - 90;
              nextVx = -Math.abs(nextVx || 40);
            }
          } else {
            nextX = w.x;
            nextVx = 0;
          }

          const nextY = w.y + w.speed * deltaSec;
          const bottom =
            (mode === "plane_shooter" || mode === "spell_word")
              ? -40 + fallHeightRef.current
              : gameAreaRef.current?.clientHeight ?? 500;
          const isDropOut = nextY > bottom - 24;

          if (isDropOut) {
            if (mode === "voice_match" && w.id === targetRef.current) {
              targetDropped = true;
            } else if (mode === "plane_shooter" || mode === "spell_word") {
              if (w.id === planeTargetIdRef.current) {
                clearPlaneTarget();
                setFeedbackText(`目标 ${w.en} 已掉落，请重新语音锁定`);
              }
              if (mode === "spell_word" && w.id === spellTargetIdRef.current) {
                setTimeout(() => pickNextSpellTarget(), 0);
              }
              setDoneCount((v) => v + 1);
              bumpStudyHistory({ en: w.en, zh: w.zh }, "wrong");
              bumpBatchResult("wrong");
              const key = `${normalizeText(w.en)}|${w.zh}`;
              setMistakeMap((prevMap) => {
                const existing = prevMap[key];
                return {
                  ...prevMap,
                  [key]: {
                    key,
                    en: w.en,
                    zh: w.zh,
                    count: (existing?.count || 0) + 1,
                  },
                };
              });
            }
            return { ...w, x: nextX, vx: nextVx, y: nextY, status: "missed" as const };
          }

          hasLive = true;
          return { ...w, x: nextX, vx: nextVx, y: nextY };
        });

        if (mode === "voice_match" && targetDropped) {
          setTimeout(() => resolveRound("miss"), 0);
        }

        if (!hasLive && (mode === "plane_shooter" || mode === "spell_word" || !targetRef.current)) {
          setTimeout(endGame, 0);
        }

        wordsRef.current = updated;
        return updated;
      });

      if (mode === "voice_match" && askingRef.current) {
        const left = Math.max(0, roundDurationRef.current - (now - roundStartRef.current));
        setCountdownMs(left);
        if (left <= 0) {
          resolveRound("timeout");
        }
      } else if (mode === "voice_match") {
        setCountdownMs(roundDurationRef.current);
      } else {
        setCountdownMs(0);
      }

      rafRef.current = requestAnimationFrame(gameLoop);
    },
    [bumpBatchResult, bumpStudyHistory, clearPlaneTarget, endGame, hitPlaneTarget, resolveRound, pickNextSpellTarget],
  );

  const startGame = useCallback(() => {
    const width = gameAreaRef.current?.clientWidth ?? 900;
    const parsed = parseWordList(wordInput, width);

    if (parsed.length < 3) {
      window.alert("请至少输入 3 条有效词条，格式：英文=中文");
      return;
    }

    const batchEntries = parsed.map((w) => ({ en: w.en, zh: w.zh }));
    addSeenHistoryBatch(batchEntries);
    registerStudyBatch(batchEntries);

    setGameState("running");
    setTotalCount(parsed.length);
    setDoneCount(0);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setTimeBoost(0);
    setFeedbackText(
      playMode === "voice_match"
        ? "开局成功，准备进入第一题"
        : playMode === "spell_word"
          ? "看中文提示，在键盘上拼出正确的英文单词，按回车确认"
          : planeDropChineseOnly
            ? "中文下落模式：按住空格说英文，目标会变红；再用左右键移动、上方向键发射"
            : "按住空格说出单词锁定红色目标，再用左右键移动飞机、上方向键发射",
    );
    setRecognizedText("");
    setShooterHits(0);
    setBullets([]);
    setPlaneTargetId(null);
    setSpellTargetId(null);
    spellTargetIdRef.current = null;
    setSpellInput([]);
    lastFrameTsRef.current = null;
    planeTargetIdRef.current = null;
    planeMoveDirRef.current = 0;
    leftPressedRef.current = false;
    rightPressedRef.current = false;
    lastFireTsRef.current = 0;
    playModeRef.current = playMode;
    fallHeightRef.current = fallHeightPx;
    const areaW = gameAreaRef.current?.clientWidth ?? 900;
    setPlaneX(areaW / 2);
    planeXRef.current = areaW / 2;

    const gameHeight = gameAreaRef.current?.clientHeight ?? 500;
    const fallDistance = (playMode === "plane_shooter" || playMode === "spell_word") ? Math.max(220, fallHeightPx) : Math.max(60, gameHeight - 24);
    const baseSpeed = fallDistance / roundSeconds;
    const revealByDefault = !(playMode === "plane_shooter" && planeDropChineseOnly);
    const syncedWords = parsed.map((w, idx) => {
      if (playMode === "plane_shooter" || playMode === "spell_word") {
        const laneX = ((idx % 8) + 1) * (areaW / 9);
        const vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 120);
        const speed = playMode === "spell_word"
          ? baseSpeed * (0.5 + Math.random() * 0.4)
          : baseSpeed * (0.75 + Math.random() * 0.7);
        return {
          ...w,
          revealedEn: playMode === "spell_word" ? false : revealByDefault,
          x: clamp(laneX, 6, areaW - 100),
          vx,
          speed,
          shuffledEn: shuffleString(w.en.toLowerCase()),
        };
      }
      return { ...w, revealedEn: true, vx: 0, speed: baseSpeed };
    });
    setWords(syncedWords);
    wordsRef.current = syncedWords;

    if (playMode === "voice_match") {
      nextRound(syncedWords);
    } else if (playMode === "spell_word") {
      askingRef.current = true;
      setCountdownMs(0);
      pickNextSpellTarget(syncedWords);
    } else {
      askingRef.current = true;
      targetRef.current = null;
      setTargetId(null);
      setRecognizedText("按住空格开始监听...");
      setCountdownMs(0);
    }

    clearRaf();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [wordInput, playMode, fallHeightPx, addSeenHistoryBatch, registerStudyBatch, nextRound, clearRaf, gameLoop, roundSeconds, planeDropChineseOnly, pickNextSpellTarget]);

  const stopGame = useCallback(() => {
    endGame();
  }, [endGame]);

  const openGameModalAndStart = useCallback(() => {
    const width = gameAreaRef.current?.clientWidth ?? 900;
    const parsed = parseWordList(wordInput, width);
    if (parsed.length < 3) {
      window.alert("请至少输入 3 条有效词条，格式：英文=中文");
      return;
    }

    setIsGameModalOpen(true);
    setStartAfterOpen(true);
  }, [wordInput]);

  const closeGameModal = useCallback(() => {
    if (gameState === "running") {
      endGame();
    }
    setStartAfterOpen(false);
    setIsGameModalOpen(false);
  }, [endGame, gameState]);

  useEffect(() => {
    if (!isGameModalOpen || !startAfterOpen) return;

    const id = requestAnimationFrame(() => {
      setStartAfterOpen(false);
      startGame();
    });

    return () => cancelAnimationFrame(id);
  }, [isGameModalOpen, startAfterOpen, startGame]);


  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const voices = synth.getVoices();
      const englishVoices = voices.filter((v) => /^en(-|_)/i.test(v.lang));
      setTtsVoices(englishVoices);
      if (!englishVoices.length) return;

      setSelectedVoiceURI((prev) => {
        if (prev && englishVoices.some((v) => v.voiceURI === prev)) return prev;
        const preferred =
          englishVoices.find((v) => /google|samantha|alex|zira|aria/i.test(v.name)) ||
          englishVoices[0];
        return preferred?.voiceURI || "";
      });
    };

    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      // 拼单词模式：捕获字母、退格、回车
      if (playMode === "spell_word" && gameState === "running") {
        if (event.key === "Backspace") {
          event.preventDefault();
          setSpellInput((prev) => prev.slice(0, -1));
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          confirmSpell();
          return;
        }
        if (/^[a-zA-Z]$/.test(event.key) && !event.repeat) {
          event.preventDefault();
          setSpellInput((prev) => [...prev, event.key.toLowerCase()]);
          return;
        }
      }

      if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "ArrowUp") {
        if (gameState !== "running" || playMode !== "plane_shooter") return;
        event.preventDefault();
        if (event.code === "ArrowLeft") {
          leftPressedRef.current = true;
          planeMoveDirRef.current = rightPressedRef.current ? 0 : -1;
          return;
        }
        if (event.code === "ArrowRight") {
          rightPressedRef.current = true;
          planeMoveDirRef.current = leftPressedRef.current ? 0 : 1;
          return;
        }
        if (!event.repeat) {
          firePlaneBullet();
        }
        return;
      }

      if (event.code !== "Space") return;
      if (event.repeat) return;
      event.preventDefault();
      const canListen =
        gameState === "running" &&
        askingRef.current &&
        (playMode === "plane_shooter" || Boolean(targetRef.current));
      if (!canListen) return;
      spaceHoldRef.current = true;
      setIsHoldingSpace(true);
      startSpeech();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        if (gameState !== "running" || playMode !== "plane_shooter") return;
        event.preventDefault();
        if (event.code === "ArrowLeft") {
          leftPressedRef.current = false;
        } else {
          rightPressedRef.current = false;
        }
        planeMoveDirRef.current = leftPressedRef.current ? -1 : rightPressedRef.current ? 1 : 0;
        return;
      }

      if (event.code !== "Space") return;
      event.preventDefault();
      spaceHoldRef.current = false;
      setIsHoldingSpace(false);
      stopSpeech();
      if (gameState === "running" && askingRef.current) {
        setRecognizedText("已停止监听（按住空格继续）");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [firePlaneBullet, gameState, playMode, startSpeech, stopSpeech, confirmSpell]);

  useEffect(() => {
    return () => {
      clearRaf();
      stopSpeech();
      if (ttsTimerRef.current) {
        window.clearTimeout(ttsTimerRef.current);
        ttsTimerRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearRaf, stopSpeech]);

  const accuracy = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
  const score = Math.max(1, Math.round(accuracy / 10));

  return (
    <main className="game-bg min-h-screen text-slate-100">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <section className="grid gap-4 rounded-2xl border border-indigo-300/25 bg-slate-950/55 p-4 backdrop-blur-md md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-indigo-200">
              1. 输入词库（每行：英文=中文释义）
            </h2>
            <textarea
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value)}
              spellCheck={false}
              className="h-40 w-full resize-y rounded-xl border border-indigo-300/35 bg-slate-950/90 p-3 text-sm text-slate-100 outline-none ring-offset-0 focus:border-emerald-400"
            />
            <p className="mt-2 text-xs text-indigo-100/85">
              支持单词和词组，例如：<code>look after=照顾</code>
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-100/90">
              <span className="shrink-0">场景词库</span>
              <select
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) loadScenario(id);
                }}
                disabled={gameState === "running"}
                defaultValue=""
                className="flex-1 rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none disabled:opacity-60"
              >
                <option value="" disabled>
                  选择一个场景快速导入词库…
                </option>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.scene}（{s.words.length}词）
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-indigo-100/90 md:grid-cols-[1fr_1fr_auto]">
              <label className="flex items-center gap-2">
                <span>模式</span>
                <select
                  value={playMode}
                  onChange={(e) => setPlayMode(e.target.value as PlayMode)}
                  disabled={gameState === "running"}
                  className="rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none disabled:opacity-60"
                >
                  <option value="voice_match">释义匹配</option>
                  <option value="plane_shooter">飞机射击</option>
                  <option value="spell_word">拼单词</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span>难度</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none"
                >
                  <option value="easy">初级</option>
                  <option value="medium">中级</option>
                  <option value="hard">高级</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span>数量</span>
                <input
                  type="number"
                  min={3}
                  max={WORD_BANK[difficulty].length}
                  value={generateCount}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value)) return;
                    const next = Math.max(3, Math.min(WORD_BANK[difficulty].length, Math.floor(value)));
                    setGenerateCount(next);
                  }}
                  className="w-24 rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none"
                />
                <span className="text-indigo-200/80">最多 {WORD_BANK[difficulty].length}</span>
              </label>
              <button
                type="button"
                onClick={generateByDifficulty}
                disabled={gameState === "running"}
                className="rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
              >
                随机生成词库
              </button>
            </div>
            {playMode === "plane_shooter" ? (
              <div className="mt-2 space-y-2 text-xs text-indigo-100/90">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={planeDropChineseOnly}
                    onChange={(e) => setPlaneDropChineseOnly(e.target.checked)}
                    disabled={gameState === "running"}
                    className="h-4 w-4 rounded border-indigo-300/40 bg-slate-900/90 accent-emerald-400 disabled:opacity-50"
                  />
                  <span>中文下落模式（先显示中文，说对英文后变英文并变红可射击）</span>
                </label>
              </div>
            ) : null}
            {playMode === "plane_shooter" ? (
              <p className="mt-2 text-xs text-sky-200">
                操作：中文下落，按住空格说英文锁定红色目标；左右方向键移动；上方向键发射。
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-100/90">
              <label htmlFor="roundSeconds">每题倒计时（秒）</label>
              <input
                id="roundSeconds"
                type="number"
                value={roundSeconds}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value)) return;
                  const next = Math.max(1, Math.floor(value));
                  setRoundSeconds(next);
                  if (gameState !== "running") {
                    roundDurationRef.current = next * 1000;
                    setCountdownMs(next * 1000);
                  }
                }}
                className="w-20 rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none"
              />
              <span className="text-indigo-200/80">可自由设置</span>
            </div>
            <div className="mt-3 rounded-xl border border-indigo-300/25 bg-slate-900/60 p-3">
              <p className="mb-2 text-xs font-semibold text-indigo-100/90">
                本地 LLM（WebLLM - 浏览器端运行，需 WebGPU）
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div ref={llmDropdownRef} className="relative">
                  <input
                    type="text"
                    value={llmDropdownOpen ? llmModelFilter : (llmModelId || "加载模型列表中...")}
                    onChange={(e) => { setLlmModelFilter(e.target.value); setLlmDropdownOpen(true); }}
                    onFocus={() => { setLlmDropdownOpen(true); setLlmModelFilter(""); }}
                    disabled={llmStatus === "loading" || !llmAvailableModels.length}
                    placeholder="搜索模型..."
                    className="w-[280px] rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white placeholder-indigo-300/40 outline-none disabled:opacity-60"
                  />
                  {llmDropdownOpen && llmAvailableModels.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-[360px] overflow-y-auto rounded-lg border border-indigo-300/35 bg-slate-900/95 py-1 shadow-xl">
                      {filteredLlmModels.length ? (
                        filteredLlmModels.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setLlmModelId(m.id); setLlmDropdownOpen(false); setLlmModelFilter(""); }}
                            className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition hover:bg-indigo-500/20 ${m.id === llmModelId ? "bg-indigo-500/15 text-indigo-100" : "text-white/80"}`}
                          >
                            <span className="flex-1 truncate">{m.cached ? "✓ " : ""}{m.id} {m.size ? `(${m.size})` : ""}{m.cached ? " [已缓存]" : ""}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-2.5 py-2 text-xs text-indigo-300/50">无匹配模型</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={loadLlmModel}
                  disabled={llmStatus === "loading" || !llmModelId}
                  className="rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {llmStatus === "loading" ? "加载中..." : (llmStatus === "ready" || selectedModelCached) ? "重新加载" : "加载模型"}
                </button>
                {llmStatus === "ready" && (
                  <button
                    type="button"
                    onClick={() => setLlmChatOpen(true)}
                    className="rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110"
                  >
                    跟AI对话
                  </button>
                )}
                {llmStatus === "ready" && (
                  <span className="text-emerald-400 text-xs">已就绪</span>
                )}
                {llmStatus === "error" && (
                  <span className="text-rose-400 text-xs">加载失败</span>
                )}
              </div>
              {llmStatus === "loading" && llmProgress && (
                <p className="mt-1.5 font-mono text-xs text-amber-200/80">
                  {llmProgress}
                </p>
              )}
              {llmStatus === "ready" && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="输入主题，如：旅行、医院、面试..."
                    value={llmTopic}
                    onChange={(e) => setLlmTopic(e.target.value)}
                    className="flex-1 rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white placeholder-indigo-300/40 outline-none"
                  />
                  <button
                    type="button"
                    onClick={generateWordsWithLlm}
                    disabled={llmGenerating}
                    className="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {llmGenerating ? "生成中..." : "AI 生成词库"}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openGameModalAndStart}
                disabled={gameState === "running"}
                className="rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
              >
                开始游戏
              </button>
              <button
                type="button"
                onClick={stopGame}
                disabled={gameState !== "running"}
                className="rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
              >
                提前结束
              </button>
              {playMode === "voice_match" ? (
                <button
                  type="button"
                  onClick={useTimeBoost}
                  disabled={gameState !== "running" || timeBoost <= 0}
                  className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  加时 +1s（{timeBoost}）
                </button>
              ) : null}
            </div>

            <div className="mt-3 rounded-xl border border-indigo-300/30 bg-slate-950/80 p-3">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs text-indigo-100/85">词库标签（点击可发音）</p>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="max-w-[220px] rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-xs text-white outline-none"
                  title="选择发音人"
                >
                  {ttsVoices.length ? (
                    ttsVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))
                  ) : (
                    <option value="">未检测到英文发音人</option>
                  )}
                </select>
              </div>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                {lexiconLabels.length ? (
                  lexiconLabels.map((item, idx) => (
                    <button
                      key={`${item.en}-${item.zh}-${idx}`}
                      type="button"
                      onClick={() => speakText(item.en)}
                      className="rounded-full border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-100 transition hover:bg-cyan-400/25"
                      title={`点击发音：${item.en}`}
                    >
                      {item.en}
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-indigo-200/70">当前词库为空或格式不完整（需英文=中文）。</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-indigo-200">2. 状态</h2>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="总题数" value={totalCount} />
              <StatCard label="已完成" value={doneCount} />
              <StatCard label={playMode === "voice_match" ? "正确" : "击中"} value={playMode === "voice_match" ? correctCount : shooterHits} />
              <StatCard label="当前连击" value={streak} />
              <StatCard label="最高连击" value={bestStreak} />
            </div>

            <div className="mt-3 rounded-xl border border-rose-300/30 bg-slate-950/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-rose-100/90">高频错词（可专项练习）</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={loadMistakePractice}
                    disabled={!mistakeList.length || gameState === "running"}
                    className="rounded-lg border border-rose-300/35 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    载入错题词库
                  </button>
                  <button
                    type="button"
                    onClick={() => setMistakeMap({})}
                    disabled={!mistakeList.length}
                    className="rounded-lg border border-rose-300/35 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    清空记录
                  </button>
                </div>
              </div>
              <div className="max-h-28 overflow-y-auto pr-1">
                {mistakeList.length ? (
                  <div className="flex flex-wrap gap-2">
                    {mistakeList.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => speakText(m.en)}
                        className="rounded-full border border-rose-300/40 bg-rose-500/15 px-2.5 py-1 text-xs text-rose-100 transition hover:bg-rose-400/25"
                        title={`${m.en}（错误 ${m.count} 次）`}
                      >
                        {m.en} ×{m.count}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-rose-100/70">还没有错词记录，开始游戏后会自动累计。</p>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-cyan-300/30 bg-slate-950/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-cyan-100/90">批次复习（同一批词单独管理）</p>
                <button
                  type="button"
                  onClick={() => setStudyBatchMap({})}
                  disabled={!studyBatchList.length}
                  className="rounded-lg border border-cyan-300/35 px-2 py-1 text-xs text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  清空批次
                </button>
              </div>
              <div className="max-h-28 overflow-y-auto pr-1">
                {studyBatchList.length ? (
                  <div className="flex flex-wrap gap-2">
                    {studyBatchList.slice(0, 40).map((batch) => (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => loadBatchPractice(batch.id)}
                        disabled={gameState === "running"}
                        className="rounded-full border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                        title={`词数${batch.wordCount} 练习${batch.playCount}次 ✓${batch.correctCount} ✗${batch.wrongCount}\n${batch.words.join("\n")}`}
                      >
                        {new Date(batch.lastPlayedAt).toLocaleDateString("zh-CN")} · {batch.wordCount}词 · 第{batch.playCount}次
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-cyan-100/70">暂无批次记录，开始游戏后会按词库自动记录批次。</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {isGameModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 md:p-6">
            <div className={`relative flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-indigo-200/35 bg-slate-950/95 shadow-2xl ${playMode === "spell_word" ? "h-[70vh]" : "h-[88vh]"}`}>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-indigo-300/30 bg-slate-950/95 px-4 py-3">
                <div className="justify-self-start">
                  <p className="text-sm font-semibold text-indigo-100">
                    {playMode === "voice_match" ? "释义匹配模式" : playMode === "spell_word" ? "拼单词模式" : "飞机射击模式"}
                  </p>
                  <p className="text-xs text-indigo-200/80">
                    {gameState === "running"
                      ? playMode === "spell_word" ? "用键盘拼出正确单词，按回车确认" : "游戏进行中（按住空格可语音识别）"
                      : "可开始新一局或查看本局成绩"}
                  </p>
                </div>
                {playMode === "voice_match" ? (
                  <p className="max-w-[48vw] justify-self-center truncate text-center text-lg font-bold text-emerald-100">
                    {currentMeaning || "准备开始..."}
                  </p>
                ) : (
                  <div />
                )}
                <div className="flex items-center justify-self-end gap-2">
                  {playMode === "voice_match" ? (
                    <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-right">
                      <p className="text-[11px] text-amber-100/80">倒计时</p>
                      <p className="text-sm font-bold text-amber-100">
                        {gameState === "running" ? `${(countdownMs / 1000).toFixed(1)}s` : `${roundSeconds}s`}
                      </p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeGameModal}
                    className="rounded-lg border border-indigo-300/40 px-3 py-1.5 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-400/20"
                  >
                    {gameState === "running" ? "结束并关闭" : "关闭窗口"}
                  </button>
                </div>
              </div>

              <section
                ref={gameAreaRef}
                className="relative flex-1 overflow-hidden bg-gradient-to-b from-blue-950/50 to-slate-950/95"
              >
                {recognizedText ? (
                  <div className="pointer-events-none absolute bottom-3 left-1/2 z-[10] -translate-x-1/2 rounded-lg border border-indigo-300/30 bg-slate-900/85 px-4 py-2 backdrop-blur-sm">
                    <p className="whitespace-nowrap text-sm font-medium text-indigo-100">
                      {recognizedText}
                    </p>
                  </div>
                ) : null}
                <div className="pointer-events-none absolute inset-0 z-[1]">
                  {likeBursts.map((item) => (
                    <span
                      key={item.id}
                      className="absolute select-none text-emerald-300 like-float"
                      style={{
                        left: `${item.left}px`,
                        top: `${item.top}px`,
                        fontSize: `${item.size}px`,
                      }}
                    >
                      👍
                    </span>
                  ))}
                </div>

                {playMode === "plane_shooter" ? (
                  <>
                    {bullets.map((b) => (
                      <div
                        key={b.id}
                        className="pointer-events-none absolute z-[2] h-5 w-1 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)]"
                        style={{ left: `${b.x}px`, top: `${b.y}px` }}
                      />
                    ))}
                    <div
                      className="pointer-events-none absolute z-[2] text-3xl"
                      style={{ left: `${planeX - 16}px`, bottom: "10px" }}
                    >
                      <span className="inline-block origin-center -rotate-45">✈️</span>
                    </div>
                  </>
                ) : null}

                {words.map((word) => {
                  if (word.status === "hit" && !word.exploding) return null;

                  const isVoiceTarget =
                    playMode === "voice_match" && targetId === word.id && word.status === "live";
                  const isPlaneTarget =
                    playMode === "plane_shooter" && planeTargetId === word.id && word.status === "live";
                  const isSpellTarget =
                    playMode === "spell_word" && spellTargetId === word.id && word.status === "live";
                  const baseClass =
                    word.status === "missed"
                      ? "border-rose-200/70 text-rose-100 opacity-55"
                      : "border-indigo-200/65 text-slate-100";

                  // Determine displayed text
                  let displayText: string;
                  if (playMode === "spell_word") {
                    if (word.spellUnlocked || word.status === "hit") {
                      displayText = word.en;
                    } else {
                      // Show: scrambled letters + chinese meaning
                      displayText = `${word.shuffledEn}  (${word.zh})`;
                    }
                  } else if (playMode === "plane_shooter") {
                    displayText = word.revealedEn ? word.en : word.zh;
                  } else {
                    displayText = word.en;
                  }

                  return (
                    <div
                      key={word.id}
                      className={[
                        "absolute top-0 rounded-xl border px-3 py-1.5 text-lg font-bold tracking-wide shadow",
                        isPlaneTarget ? "bg-rose-900/90" : isSpellTarget ? "bg-amber-900/90" : "bg-blue-950/90",
                        baseClass,
                        isVoiceTarget ? "border-emerald-300 shadow-emerald-400/30" : "",
                        isPlaneTarget ? "border-rose-300 shadow-rose-400/30" : "",
                        isSpellTarget ? "border-amber-300 shadow-amber-400/40" : "",
                        word.spellUnlocked ? "border-emerald-400 bg-emerald-900/80" : "",
                        word.exploding ? "animate-boom" : "",
                      ].join(" ")}
                      style={{ left: `${word.x}px`, transform: `translateY(${word.y}px)` }}
                    >
                      {playMode === "spell_word" && isSpellTarget ? (
                        <span className="flex items-center gap-1">
                          {word.shuffledEn.split("").map((ch, i) => (
                            <span key={i} className="inline-flex h-7 w-6 items-center justify-center rounded border border-amber-300/50 bg-amber-950/60 text-base text-amber-100">
                              {ch}
                            </span>
                          ))}
                          <span className="ml-1.5 text-sm font-normal text-amber-200/70">({word.zh})</span>
                        </span>
                      ) : displayText}
                    </div>
                  );
                })}

                {/* 拼单词模式：底部输入显示区 */}
                {playMode === "spell_word" && gameState === "running" && (
                  <div className="absolute bottom-0 left-0 right-0 z-[10] flex flex-col items-center gap-2 border-t border-indigo-300/20 bg-slate-950/90 px-4 py-3 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5">
                      {spellInput.length === 0 ? (
                        <span className="text-sm text-indigo-300/50">在键盘上输入字母...</span>
                      ) : (
                        spellInput.map((ch, i) => (
                          <span
                            key={i}
                            className="inline-flex h-9 w-8 items-center justify-center rounded-lg border-2 border-indigo-400/60 bg-indigo-950/80 text-lg font-bold text-white shadow"
                          >
                            {ch}
                          </span>
                        ))
                      )}
                      <span className="inline-flex h-9 w-8 items-center justify-center rounded-lg border-2 border-dashed border-indigo-400/30 text-indigo-400/40">
                        _
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-indigo-300/60">
                      <span>Backspace 删除</span>
                      <span>Enter 确认</span>
                    </div>
                  </div>
                )}

                {gameState !== "running" ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/55 p-4 text-center">
                    <div className="max-w-xl rounded-2xl border border-indigo-200/35 bg-slate-950/95 p-6">
                      <h1 className="text-3xl font-extrabold">
                        {gameState === "ended" ? "游戏结束" : "英语语音打词"}
                      </h1>
                      {gameState === "ended" ? (
                        <>
                          {playMode === "voice_match" ? (
                            <>
                              <p className="mt-2 text-indigo-100">正确 {correctCount} / {totalCount}</p>
                              <p className="mt-1 text-indigo-100">准确率：{accuracy}%</p>
                            </>
                          ) : (
                            <p className="mt-2 text-indigo-100">击中 {shooterHits} / {totalCount}</p>
                          )}
                          <p className="mt-1 text-indigo-100">最高连击：{bestStreak}</p>
                          <p className="mt-1 text-3xl font-black text-emerald-300">
                            {playMode === "voice_match" ? `评分：${score} / 10` : `成绩：${shooterHits}`}
                          </p>
                          {playMode === "spell_word" && (
                            <p className="mt-1 text-sm text-indigo-200/80">
                              拼写正确并击中 {shooterHits} 个单词
                            </p>
                          )}
                          <p className="mt-2 text-sm text-indigo-100/85">修改词库后可再次开始</p>
                          <button
                            type="button"
                            onClick={closeGameModal}
                            className="mt-3 rounded-lg border border-indigo-300/45 px-3 py-1.5 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-400/20"
                          >
                            关闭窗口
                          </button>
                        </>
                      ) : (
                        <>
                          {playMode === "spell_word" ? (
                            <>
                              <p className="mt-2 text-indigo-100">单词从上方掉落，字母顺序被打乱。</p>
                              <p className="mt-1 text-indigo-100">在键盘上拼出正确的英文单词，按 Enter 确认。</p>
                              <p className="mt-1 text-indigo-100">拼写正确后子弹会自动击中目标！</p>
                            </>
                          ) : playMode === "voice_match" ? (
                            <>
                              <p className="mt-2 text-indigo-100">看到中文后，在限时内按住空格说出对应英文。</p>
                              <p className="mt-1 text-indigo-100">匹配成功时单词会爆炸消失，全部完成后自动评分。</p>
                            </>
                          ) : (
                            <>
                              <p className="mt-2 text-indigo-100">
                                {planeDropChineseOnly
                                  ? "中文会先下落，按住空格说出对应英文后，该词会切换为英文并变成红色目标。"
                                  : "按住空格说出下落英文，匹配后该词会变成红色目标。"}
                              </p>
                              <p className="mt-1 text-indigo-100">左右方向键移动飞机，上方向键发射子弹，击中红色目标才会爆炸并计分。</p>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}
      </div>

      {/* LLM 对话浮窗 */}
      {<LlmChat engine={llmEngine} modelId={llmModelId} open={llmChatOpen} onClose={() => setLlmChatOpen(false)} />}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-indigo-300/25 bg-slate-950/85 p-3">
      <p className="text-xs text-indigo-100/80">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-white">{value}</p>
    </div>
  );
}
