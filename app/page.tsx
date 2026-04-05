"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordItem = {
  id: string;
  en: string;
  zh: string;
  normalized: string;
  x: number;
  vx: number;
  y: number;
  speed: number;
  status: "live" | "hit" | "missed";
  exploding: boolean;
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
type PlayMode = "voice_match" | "plane_shooter";

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

const ROUND_MS = 3000;
const MIN_ROUND_SECONDS = 3;
const MAX_ROUND_SECONDS = 30;
const STUDY_HISTORY_STORAGE_KEY = "english_voice_game_study_history_v1";
const STUDY_BATCH_STORAGE_KEY = "english_voice_game_study_batch_v1";

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
      x,
      vx: 0,
      y: -40 - Math.random() * 220,
      speed: 46 + Math.random() * 26,
      status: "live",
      exploding: false,
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
  const [playMode, setPlayMode] = useState<PlayMode>("voice_match");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState("");
  const [countdownMs, setCountdownMs] = useState(ROUND_MS);
  const [roundSeconds, setRoundSeconds] = useState(3);
  const [fallHeightPx, setFallHeightPx] = useState(520);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [generateCount, setGenerateCount] = useState(8);
  const [totalCount, setTotalCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeBoost, setTimeBoost] = useState(0);
  const [feedbackText, setFeedbackText] = useState("准备好开口说英语了吗？");
  const [likeBursts, setLikeBursts] = useState<LikeBurst[]>([]);
  const [mistakeMap, setMistakeMap] = useState<Record<string, MistakeRecord>>({});
  const [studyHistoryMap, setStudyHistoryMap] = useState<Record<string, StudyHistoryRecord>>({});
  const [studyBatchMap, setStudyBatchMap] = useState<Record<string, StudyBatchRecord>>({});
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [planeX, setPlaneX] = useState(240);
  const [planeTargetX, setPlaneTargetX] = useState(240);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [shooterHits, setShooterHits] = useState(0);

  const wordsRef = useRef<WordItem[]>([]);
  const playModeRef = useRef<PlayMode>("voice_match");
  const planeXRef = useRef(240);
  const planeTargetXRef = useRef(240);
  const fallHeightRef = useRef(520);
  const roundStartRef = useRef(0);
  const lastFrameTsRef = useRef<number | null>(null);
  const ttsTimerRef = useRef<number | null>(null);
  const pendingShotTargetRef = useRef<string | null>(null);
  const currentBatchIdRef = useRef<string | null>(null);
  const askingRef = useRef(false);
  const targetRef = useRef<string | null>(null);
  const spaceHoldRef = useRef(false);
  const [isHoldingSpace, setIsHoldingSpace] = useState(false);

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
  const studyHistoryList = useMemo(
    () =>
      Object.values(studyHistoryMap).sort((a, b) => {
        if (b.lastStudiedAt !== a.lastStudiedAt) return b.lastStudiedAt - a.lastStudiedAt;
        return (b.wrongCount - b.correctCount) - (a.wrongCount - a.correctCount);
      }),
    [studyHistoryMap],
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
    planeTargetXRef.current = planeTargetX;
  }, [planeTargetX]);

  useEffect(() => {
    fallHeightRef.current = fallHeightPx;
  }, [fallHeightPx]);

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

  const triggerPlaneShot = useCallback((target: WordItem) => {
    if (!gameAreaRef.current) return;
    const areaW = gameAreaRef.current.clientWidth;
    const toX = clamp(target.x + 24, 24, Math.max(24, areaW - 24));
    setPlaneTargetX(toX);
    planeTargetXRef.current = toX;
    pendingShotTargetRef.current = target.id;
    setFeedbackText(`锁定 ${target.en}，飞机射击中`);
  }, []);

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
          triggerPlaneShot(containsCandidate);
          return;
        }

        if (bestShooter.score >= 0.58) {
          triggerPlaneShot(bestShooter.word);
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
    [playMode, triggerPlaneShot, resolveRound],
  );

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
    const target = liveWords.find((w) => w.id === targetRef.current);
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
    targetRef.current = null;
    askingRef.current = false;
    spaceHoldRef.current = false;
    setIsHoldingSpace(false);
    setRecognizedText("");
    setCountdownMs(0);
    setBullets([]);
    pendingShotTargetRef.current = null;
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

  const loadMistakePractice = useCallback(() => {
    if (!mistakeList.length) return;
    const lines = mistakeList.map((m) => `${m.en}=${m.zh}`).join("\n");
    setWordInput(lines);
    setFeedbackText(`已载入 ${mistakeList.length} 条错题词库，可直接开始专项练习`);
  }, [mistakeList]);

  const loadStudyHistoryPractice = useCallback(
    (onlyWrong: boolean) => {
      const source = onlyWrong
        ? studyHistoryList.filter((x) => x.wrongCount > 0)
        : studyHistoryList;
      if (!source.length) return;
      const lines = source.slice(0, 120).map((x) => `${x.en}=${x.zh}`).join("\n");
      setWordInput(lines);
      setFeedbackText(
        `已载入 ${Math.min(source.length, 120)} 条${onlyWrong ? "高错词" : "学习历史"}复习词库`,
      );
    },
    [studyHistoryList],
  );

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
        let desiredPlaneX = planeTargetXRef.current;
        const pendingId = pendingShotTargetRef.current;
        if (pendingId) {
          const pendingTarget = wordsRef.current.find((w) => w.id === pendingId && w.status === "live");
          if (pendingTarget) {
            const areaW = gameAreaRef.current?.clientWidth ?? 900;
            desiredPlaneX = clamp(pendingTarget.x + 24, 24, Math.max(24, areaW - 24));
            setPlaneTargetX(desiredPlaneX);
            planeTargetXRef.current = desiredPlaneX;
          } else {
            pendingShotTargetRef.current = null;
          }
        }

        let nextPlaneX = planeXRef.current;
        setPlaneX((prev) => {
          const step = 760 * deltaSec;
          const delta = desiredPlaneX - prev;
          if (Math.abs(delta) <= step) {
            nextPlaneX = desiredPlaneX;
            planeXRef.current = desiredPlaneX;
            return desiredPlaneX;
          }
          const v = prev + Math.sign(delta) * step;
          nextPlaneX = v;
          planeXRef.current = v;
          return v;
        });

        const shootTarget = pendingShotTargetRef.current;
        if (shootTarget && Math.abs(nextPlaneX - desiredPlaneX) < 12) {
          const areaH = gameAreaRef.current?.clientHeight ?? 500;
          setBullets((prev) => [
            ...prev,
            { id: `${Date.now()}-${Math.random()}`, x: nextPlaneX, y: areaH - 34, speed: 760, targetId: shootTarget },
          ]);
          pendingShotTargetRef.current = null;
        }

        setBullets((prev) => {
          const moved: Bullet[] = [];
          for (const b of prev) {
            const target = wordsRef.current.find((w) => w.id === b.targetId && w.status === "live");
            if (!target) continue;

            const tx = target.x + 24;
            const ty = target.y + 6;
            const dx = tx - b.x;
            const dy = ty - b.y;
            const dist = Math.hypot(dx, dy);
            const step = b.speed * deltaSec;

            if (dist < 24 || step >= dist) {
              setWords((old) => {
                const updated: WordItem[] = old.map((w) =>
                  w.id === b.targetId ? { ...w, status: "hit" as const, exploding: true } : w,
                );
                wordsRef.current = updated;
                return updated;
              });
              setTimeout(() => {
                setWords((old) => {
                  const updated: WordItem[] = old.map((w) =>
                    w.id === b.targetId ? { ...w, exploding: false } : w,
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
              setFeedbackText(`命中 ${target.en}！`);
              continue;
            }

            const nx = b.x + (dx / dist) * step;
            const ny = b.y + (dy / dist) * step;
            moved.push({ ...b, x: nx, y: ny });
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
          if (mode === "plane_shooter") {
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
            mode === "plane_shooter"
              ? -40 + fallHeightRef.current
              : gameAreaRef.current?.clientHeight ?? 500;
          const isDropOut = nextY > bottom - 24;

          if (isDropOut) {
            if (mode === "voice_match" && w.id === targetRef.current) {
              targetDropped = true;
            } else if (mode === "plane_shooter") {
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

        if (!hasLive && (mode === "plane_shooter" || !targetRef.current)) {
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
    [bumpBatchResult, bumpStudyHistory, emitLikeBurst, endGame, resolveRound],
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
    setFeedbackText(playMode === "voice_match" ? "开局成功，准备进入第一题" : "按住空格并说出下落中的英文，飞机会自动射击");
    setRecognizedText("");
    setShooterHits(0);
    setBullets([]);
    lastFrameTsRef.current = null;
    pendingShotTargetRef.current = null;
    playModeRef.current = playMode;
    fallHeightRef.current = fallHeightPx;
    const areaW = gameAreaRef.current?.clientWidth ?? 900;
    setPlaneX(areaW / 2);
    setPlaneTargetX(areaW / 2);
    planeXRef.current = areaW / 2;
    planeTargetXRef.current = areaW / 2;

    const gameHeight = gameAreaRef.current?.clientHeight ?? 500;
    const fallDistance = playMode === "plane_shooter" ? Math.max(220, fallHeightPx) : Math.max(60, gameHeight - 24);
    const baseSpeed = fallDistance / roundSeconds;
    const syncedWords = parsed.map((w, idx) => {
      if (playMode === "plane_shooter") {
        const laneX = ((idx % 8) + 1) * (areaW / 9);
        const vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 120);
        const speed = baseSpeed * (0.75 + Math.random() * 0.7);
        return { ...w, x: clamp(laneX, 6, areaW - 100), vx, speed };
      }
      return { ...w, vx: 0, speed: baseSpeed };
    });
    setWords(syncedWords);
    wordsRef.current = syncedWords;

    if (playMode === "voice_match") {
      nextRound(syncedWords);
    } else {
      askingRef.current = true;
      targetRef.current = null;
      setTargetId(null);
      setRecognizedText("按住空格开始监听...");
      setCountdownMs(0);
    }

    clearRaf();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [wordInput, playMode, fallHeightPx, addSeenHistoryBatch, registerStudyBatch, nextRound, clearRaf, gameLoop, roundSeconds]);

  const stopGame = useCallback(() => {
    endGame();
  }, [endGame]);

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
      if (event.code !== "Space") return;
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
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
  }, [gameState, playMode, startSpeech, stopSpeech]);

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
              <div className="mt-2 flex items-center gap-2 text-xs text-indigo-100/90">
                <label htmlFor="fallHeight">下坠总高度(px)</label>
                <input
                  id="fallHeight"
                  type="number"
                  min={220}
                  max={1400}
                  value={fallHeightPx}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value)) return;
                    setFallHeightPx(clamp(Math.floor(value), 220, 1400));
                  }}
                  className="w-24 rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none"
                />
                <span className="text-indigo-200/80">范围 220-1400</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-100/90">
              <label htmlFor="roundSeconds">每题倒计时（秒）</label>
              <input
                id="roundSeconds"
                type="number"
                min={MIN_ROUND_SECONDS}
                max={MAX_ROUND_SECONDS}
                value={roundSeconds}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value)) return;
                  const next = Math.max(MIN_ROUND_SECONDS, Math.min(MAX_ROUND_SECONDS, Math.floor(value)));
                  setRoundSeconds(next);
                  if (gameState !== "running") {
                    roundDurationRef.current = next * 1000;
                    setCountdownMs(next * 1000);
                  }
                }}
                className="w-20 rounded-lg border border-indigo-300/35 bg-slate-900/90 px-2 py-1 text-sm text-white outline-none"
              />
              <span className="text-indigo-200/80">范围 {MIN_ROUND_SECONDS}-{MAX_ROUND_SECONDS}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startGame}
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
              <StatCard label="倒计时" value={playMode === "voice_match" ? `${(countdownMs / 1000).toFixed(1)}s` : "--"} />
              <StatCard label="当前连击" value={streak} />
              <StatCard label="最高连击" value={bestStreak} />
              <StatCard label="空格监听" value={isHoldingSpace ? "进行中" : "未按下"} />
            </div>

            <div className="mt-3 rounded-xl border border-indigo-300/35 bg-slate-950/90 p-3">
              <p className="text-xs text-indigo-100/85">
                {playMode === "voice_match" ? "请说出这个中文含义对应的英文：" : "请说出任意下落单词/词组的英文："}
              </p>
              <p className="mt-1 min-h-8 text-2xl font-bold tracking-wide text-white">
                {playMode === "voice_match" ? currentMeaning : "飞机射击模式"}
              </p>
              <p className="mt-2 min-h-5 truncate text-xs text-emerald-200">{recognizedText}</p>
              <p className="mt-1 min-h-5 text-xs text-amber-200">{feedbackText}</p>
              <p className="mt-1 text-xs text-sky-200">操作：按住空格开始识别，松开空格结束识别。</p>
              {!speechSupported ? (
                <p className="mt-1 text-xs text-rose-200">浏览器不支持语音识别，请使用 Chrome 并允许麦克风权限。</p>
              ) : null}
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

            <div className="mt-3 rounded-xl border border-emerald-300/30 bg-slate-950/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-emerald-100/90">学习历史（本地保存，便于复习）</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadStudyHistoryPractice(false)}
                    disabled={!studyHistoryList.length || gameState === "running"}
                    className="rounded-lg border border-emerald-300/35 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    载入历史复习
                  </button>
                  <button
                    type="button"
                    onClick={() => loadStudyHistoryPractice(true)}
                    disabled={!studyHistoryList.some((x) => x.wrongCount > 0) || gameState === "running"}
                    className="rounded-lg border border-emerald-300/35 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    仅载入高错词
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudyHistoryMap({})}
                    disabled={!studyHistoryList.length}
                    className="rounded-lg border border-emerald-300/35 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    清空历史
                  </button>
                </div>
              </div>
              <div className="max-h-28 overflow-y-auto pr-1">
                {studyHistoryList.length ? (
                  <div className="flex flex-wrap gap-2">
                    {studyHistoryList.slice(0, 80).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => speakText(item.en)}
                        className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/25"
                        title={`${item.en} 学习${item.seenCount}次 ✓${item.correctCount} ✗${item.wrongCount}`}
                      >
                        {item.en} · 学习{item.seenCount}次
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-100/70">暂无历史，开始游戏后会自动记录已学单词。</p>
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

        <section
          ref={gameAreaRef}
          className="relative mt-4 h-[52vh] min-h-[300px] overflow-hidden rounded-2xl border border-indigo-300/35 bg-gradient-to-b from-blue-950/50 to-slate-950/95 md:h-[56vh] md:min-h-[340px]"
        >
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

            const isTarget = targetId === word.id && word.status === "live";
            const baseClass =
              word.status === "missed"
                ? "border-rose-200/70 text-rose-100 opacity-55"
                : "border-indigo-200/65 text-slate-100";

            return (
              <div
                key={word.id}
                className={[
                  "absolute top-0 rounded-xl border bg-blue-950/90 px-3 py-1.5 text-lg font-bold tracking-wide shadow",
                  baseClass,
                  isTarget ? "border-emerald-300 shadow-emerald-400/30" : "",
                  word.exploding ? "animate-boom" : "",
                ].join(" ")}
                style={{ left: `${word.x}px`, transform: `translateY(${word.y}px)` }}
              >
                {word.en}
              </div>
            );
          })}

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
                    <p className="mt-2 text-sm text-indigo-100/85">修改词库后可再次开始</p>
                  </>
                ) : (
                  <>
                    {playMode === "voice_match" ? (
                      <>
                        <p className="mt-2 text-indigo-100">看到中文后，在限时内按住空格说出对应英文。</p>
                        <p className="mt-1 text-indigo-100">匹配成功时单词会爆炸消失，全部完成后自动评分。</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-indigo-100">按住空格说出下落中的英文，飞机会自动横向移动并射击。</p>
                        <p className="mt-1 text-indigo-100">命中就爆炸消失，最终按击中数计分；下坠总高度可自定义。</p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
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
