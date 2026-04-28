"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LlmChat from "./LlmChat";
import AuthModal, { type AuthUser } from "./AuthModal";
import RobotVoiceWave from "./game/RobotVoiceWave";
import {
  AppHeader,
  BrowserWarning,
  LexiconAndStartPanel,
  LlmSettingsPanel,
  ModeSelector,
  ReviewPanels,
} from "./game/HomeSections";
import {
  DEFAULT_WORDS,
  OPENAI_TTS_VOICES,
  ROUND_MS,
  SCENARIOS,
  STUDY_BATCH_STORAGE_KEY,
  STUDY_HISTORY_STORAGE_KEY,
} from "./game/constants";
import type {
  Bullet,
  CloudProviderConfig,
  CloudProviderId,
  GameSpeechEngine,
  GameState,
  LexiconItem,
  LikeBurst,
  MistakeRecord,
  OpenAiTtsVoice,
  PlayMode,
  RobotChatMessage,
  SpellChallengeMode,
  StudyBatchRecord,
  StudyHistoryRecord,
  WordItem,
} from "./game/types";
import type { SpeechRecognitionLike } from "./game/speechTypes";
import {
  clamp,
  createMissingLetterIndexes,
  getBatchId,
  getSpellChallengeAnswer,
  getSpellChallengeInputLimit,
  normalizeText,
  parseLexiconEntries,
  parseWordList,
  shuffleString,
  similarity,
} from "./game/wordUtils";
import { getOpenAiSpeechBlob } from "./game/ttsCache";
import {
  getExplanationCacheKey,
  readCachedExplanation,
  writeCachedExplanation,
} from "./game/wordExplanationCache";

function normalizeGameDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 30;
  return Math.max(1, Math.floor(seconds));
}

function splitSpeechSegments(text: string, maxChars = 90): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const segments: string[] = [];
  let current = "";
  for (const sentence of sentences.length ? sentences : [text.trim()]) {
    if (!current) {
      current = sentence;
      continue;
    }
    if ((current + sentence).length <= maxChars) {
      current += sentence;
    } else {
      segments.push(current);
      current = sentence;
    }
  }
  if (current) segments.push(current);
  return segments.flatMap((segment) => {
    if (segment.length <= maxChars) return [segment];
    const chunks: string[] = [];
    for (let i = 0; i < segment.length; i += maxChars) {
      chunks.push(segment.slice(i, i + maxChars));
    }
    return chunks;
  });
}

function isAudioAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function getLetterIndexByTypedPosition(word: string, typedPosition: number): number {
  let count = 0;
  for (let i = 0; i < word.length; i += 1) {
    if (!/^[a-zA-Z]$/.test(word[i])) continue;
    if (count === typedPosition) return i;
    count += 1;
  }
  return -1;
}

function getUsedCount(chars: string[], target: string): number {
  return chars.filter((ch) => ch === target).length;
}

function shuffleLetters(chars: string[]): string[] {
  const result = [...chars];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const GAME_SPEECH_AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

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
  const [gameSpeechEngine, setGameSpeechEngine] = useState<GameSpeechEngine>("browser");
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
  const [openAiSpeechVoice, setOpenAiSpeechVoice] = useState<OpenAiTtsVoice>("marin");
  const [openAiSpeechSpeed, setOpenAiSpeechSpeed] = useState(0.9);
  const [spellChallengeMode, setSpellChallengeMode] = useState<SpellChallengeMode>("shuffle");
  const [planeX, setPlaneX] = useState(240);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [shooterHits, setShooterHits] = useState(0);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [startAfterOpen, setStartAfterOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [showBrowserWarning, setShowBrowserWarning] = useState(false);
  // ---- WebLLM 本地大模型 ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [llmEngine, setLlmEngine] = useState<any>(null);
  const [llmStatus, setLlmStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [llmProgress, setLlmProgress] = useState("");
  const [llmModelId, setLlmModelId] = useState("");
  const [llmAvailableModels, setLlmAvailableModels] = useState<{ id: string; size: string; cached?: boolean }[]>([]);
  const [llmGenerating, setLlmGenerating] = useState(false);
  const [lexiconNormalizing, setLexiconNormalizing] = useState(false);
  const [llmTopic, setLlmTopic] = useState("");
  const [llmChatOpen, setLlmChatOpen] = useState(false);
  const [explainingWordKey, setExplainingWordKey] = useState<string | null>(null);
  const [robotVoiceWave, setRobotVoiceWave] = useState<{
    active: boolean;
    word: string;
    progress: string;
    percent: number;
    speaking: boolean;
    asking: boolean;
    explanation: string;
    messages: RobotChatMessage[];
  }>({
    active: false,
    word: "",
    progress: "",
    percent: 0,
    speaking: false,
    asking: false,
    explanation: "",
    messages: [],
  });
  const [cloudProviders, setCloudProviders] = useState<CloudProviderConfig[]>([
    {
      id: "openai",
      label: "OpenAI",
      configured: false,
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4o-mini",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      configured: false,
      baseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
    },
  ]);
  const [cloudProviderId, setCloudProviderId] = useState<CloudProviderId>("openai");
  const [cloudModel, setCloudModel] = useState("gpt-4o-mini");

  // ---- 用户鉴权（暂时禁用，需要时取消注释） ----
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const authLoaded = false; // 暂时不加载

  // useEffect(() => {
  //   let cancelled = false;
  //   fetch("/api/auth/me", { credentials: "same-origin" })
  //     .then((r) => r.json())
  //     .then((data) => {
  //       if (!cancelled) setAuthUser(data.user || null);
  //     })
  //     .catch(() => {})
  //     .finally(() => {
  //       if (!cancelled) setAuthLoaded(true);
  //     });
  //   return () => {
  //     cancelled = true;
  //   };
  // }, []);

  // const logout = useCallback(async () => {
  //   try {
  //     await fetch("/api/auth/logout", {
  //       method: "POST",
  //       credentials: "same-origin",
  //     });
  //   } catch {
  //     // ignore
  //   }
  //   setAuthUser(null);
  // }, []);
  const [llmModelFilter, setLlmModelFilter] = useState("");
  // ---- 拼单词模式 ----
  const [spellInput, _setSpellInput] = useState<string[]>([]);
  const spellInputRef = useRef<string[]>([]);
  const setSpellInput = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    _setSpellInput((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      spellInputRef.current = next;
      return next;
    });
  }, []);
  const [spellTargetId, setSpellTargetId] = useState<string | null>(null);
  const [spellPulseIndex, setSpellPulseIndex] = useState<number | null>(null);
  const [llmDropdownOpen, setLlmDropdownOpen] = useState(false);
  const llmDropdownRef = useRef<HTMLDivElement>(null);

  const wordsRef = useRef<WordItem[]>([]);
  const gameStateRef = useRef<GameState>("idle");
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
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsStopResolverRef = useRef<(() => void) | null>(null);
  const robotStopRequestedRef = useRef(false);
  const robotSeekRequestRef = useRef<{ percent: number } | null>(null);
  const robotPlaybackSessionRef = useRef(0);
  const robotSegmentsRef = useRef<string[]>([]);
  const robotContextRef = useRef<{
    word: string;
    zh: string;
    explanation: string;
    messages: RobotChatMessage[];
  }>({
    word: "",
    zh: "",
    explanation: "",
    messages: [],
  });
  const currentBatchIdRef = useRef<string | null>(null);
  const askingRef = useRef(false);
  const targetRef = useRef<string | null>(null);
  const spaceHoldRef = useRef(false);
  const autoListenRef = useRef(false);
  const gameSpeechEngineRef = useRef<GameSpeechEngine>("browser");
  const gameSpeechRecorderRef = useRef<MediaRecorder | null>(null);
  const gameSpeechStreamRef = useRef<MediaStream | null>(null);
  const gameSpeechChunksRef = useRef<Blob[]>([]);
  const gameSpeechRestartTimerRef = useRef<number | null>(null);
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
  const selectedCloudProvider = useMemo(
    () => cloudProviders.find((provider) => provider.id === cloudProviderId) || cloudProviders[0],
    [cloudProviderId, cloudProviders],
  );
  const currentSpellTarget = useMemo(
    () => words.find((word) => word.id === spellTargetId && word.status === "live") || null,
    [spellTargetId, words],
  );
  const touchSpellCandidates = useMemo(() => {
    if (!currentSpellTarget) return [];
    if (currentSpellTarget.spellChallengeMode === "shuffle") {
      const usedCounts = new Map<string, number>();
      const candidates = Array.from(currentSpellTarget.shuffledEn.toLowerCase()).map((ch, index) => {
        const used = usedCounts.get(ch) || 0;
        usedCounts.set(ch, used + 1);
        return {
          id: `${ch}-${index}`,
          label: ch,
          disabled: getUsedCount(spellInput, ch) > used,
        };
      });
      return candidates;
    }

    const answer = getSpellChallengeAnswer(currentSpellTarget);
    const next = answer[spellInput.length];
    if (!next) return [];
    const wordLetters = Array.from(new Set(answer.split("").filter((ch) => ch !== next)));
    const alphabet = "abcdefghijklmnopqrstuvwxyz".split("").filter((ch) => ch !== next && !wordLetters.includes(ch));
    const distractors = shuffleLetters([...wordLetters, ...alphabet]).slice(0, 7);
    return shuffleLetters([next, ...distractors]).map((ch, index) => ({
      id: `${ch}-${index}`,
      label: ch,
      disabled: false,
    }));
  }, [currentSpellTarget, spellInput]);
  const aiGenerationAvailable = Boolean(selectedCloudProvider?.configured) || llmStatus === "ready";
  const aiGenerationLabel = selectedCloudProvider?.configured
    ? `${selectedCloudProvider.label} 生成`
    : llmStatus === "ready"
      ? "本地 AI 生成"
      : "AI 未配置";

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  useEffect(() => {
    gameSpeechEngineRef.current = gameSpeechEngine;
  }, [gameSpeechEngine]);

  useEffect(() => {
    planeXRef.current = planeX;
  }, [planeX]);

  useEffect(() => {
    planeTargetIdRef.current = planeTargetId;
  }, [planeTargetId]);

  useEffect(() => {
    fallHeightRef.current = fallHeightPx;
  }, [fallHeightPx]);

  // 触摸设备检测（平板、手机）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(hasTouch);
  }, []);

  // 浏览器类型检测：非 Chrome 提醒用户切换
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const vendor = navigator.vendor || "";
    // 严格判定 Chrome：排除 Edge / Opera / Brave / Samsung / Firefox / Safari 等
    const isChrome =
      /Chrome\//.test(ua) &&
      /Google Inc/.test(vendor) &&
      !/Edg\//.test(ua) &&
      !/OPR\//.test(ua) &&
      !/Opera/.test(ua) &&
      !/SamsungBrowser/.test(ua) &&
      !/Brave/.test(ua);
    if (!isChrome) {
      setShowBrowserWarning(true);
    }
  }, []);

  // 读取服务端可用的云端大模型配置。API Key 不会返回到浏览器。
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/cloud-config")
      .then((resp) => resp.json())
      .then((data: { providers?: CloudProviderConfig[] }) => {
        if (cancelled || !Array.isArray(data.providers)) return;
        setCloudProviders(data.providers);
        const preferred =
          data.providers.find((provider) => provider.id === cloudProviderId && provider.configured) ||
          data.providers.find((provider) => provider.configured) ||
          data.providers.find((provider) => provider.id === cloudProviderId) ||
          data.providers[0];
        if (preferred) {
          setCloudProviderId(preferred.id);
          setCloudModel(preferred.defaultModel);
        }
      })
      .catch(() => {
        // 云端模型配置不是启动必需项，失败时仍可继续使用本地模型。
      });
    return () => {
      cancelled = true;
    };
    // 只在首屏读取一次服务端配置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const releaseOpenAiAudio = useCallback((pause = true) => {
    if (ttsTimerRef.current) {
      window.clearTimeout(ttsTimerRef.current);
      ttsTimerRef.current = null;
    }
    if (ttsAudioRef.current) {
      const audio = ttsAudioRef.current;
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      if (pause) {
        audio.pause();
      }
      audio.src = "";
      ttsAudioRef.current = null;
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
  }, []);

  const cleanupOpenAiAudio = useCallback(() => {
    const stopResolver = ttsStopResolverRef.current;
    ttsStopResolverRef.current = null;
    stopResolver?.();
    releaseOpenAiAudio();
  }, [releaseOpenAiAudio]);

  const speakText = useCallback(async (text: string) => {
    const input = text.trim();
    if (!input || typeof window === "undefined") return;

    robotStopRequestedRef.current = true;
    robotSeekRequestRef.current = null;
    robotPlaybackSessionRef.current += 1;
    cleanupOpenAiAudio();
    setRobotVoiceWave((prev) => ({ ...prev, active: false, speaking: false }));
    setFeedbackText(`正在通过 OpenAI 合成发音：${input}`);

    try {
      const { blob, fromCache } = await getOpenAiSpeechBlob(input, openAiSpeechSpeed, openAiSpeechVoice);
      setFeedbackText(
        fromCache
          ? `正在播放本地缓存发音：${input}（${openAiSpeechVoice} · ${openAiSpeechSpeed.toFixed(1)}x）`
          : `OpenAI 发音已缓存：${input}（${openAiSpeechVoice} · ${openAiSpeechSpeed.toFixed(1)}x）`,
      );
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsObjectUrlRef.current = url;
      ttsAudioRef.current = audio;
      audio.onended = cleanupOpenAiAudio;
      audio.onerror = () => {
        cleanupOpenAiAudio();
        setFeedbackText("OpenAI 发音播放失败，请稍后重试");
      };
      await audio.play();
    } catch (err) {
      cleanupOpenAiAudio();
      setFeedbackText(`OpenAI 发音失败：${(err as Error).message || "请检查服务端配置"}`);
      console.error("OpenAI speech playback failed:", err);
    }
  }, [cleanupOpenAiAudio, openAiSpeechSpeed, openAiSpeechVoice]);

  const playSpeechBlob = useCallback((
    blob: Blob,
    options?: {
      startTime?: number;
      startRatio?: number;
      onProgress?: (currentTime: number, duration: number) => void;
    },
  ): Promise<"ended" | "stopped"> => {
    return new Promise((resolve, reject) => {
      cleanupOpenAiAudio();
      let settled = false;
      const settle = (result: "ended" | "stopped") => {
        if (settled) return;
        settled = true;
        ttsStopResolverRef.current = null;
        resolve(result);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        ttsStopResolverRef.current = null;
        reject(err);
      };
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsObjectUrlRef.current = url;
      ttsAudioRef.current = audio;
      ttsStopResolverRef.current = () => settle("stopped");
      audio.onloadedmetadata = () => {
        const targetTime =
          options?.startTime ??
          (options?.startRatio && Number.isFinite(audio.duration)
            ? audio.duration * options.startRatio
            : 0);
        if (targetTime > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(targetTime, Math.max(0, audio.duration - 0.05));
        }
        options?.onProgress?.(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.ontimeupdate = () => {
        options?.onProgress?.(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.onended = () => {
        ttsStopResolverRef.current = null;
        settle("ended");
        releaseOpenAiAudio(false);
      };
      audio.onerror = () => {
        ttsStopResolverRef.current = null;
        fail(new Error("音频播放失败"));
        releaseOpenAiAudio();
      };
      audio.play().catch((err) => {
        ttsStopResolverRef.current = null;
        if (isAudioAbortError(err)) {
          settle("stopped");
          releaseOpenAiAudio();
          return;
        }
        fail(err);
        releaseOpenAiAudio();
      });
    });
  }, [cleanupOpenAiAudio, releaseOpenAiAudio]);

  const closeRobotVoiceWave = useCallback(() => {
    robotStopRequestedRef.current = true;
    robotSeekRequestRef.current = null;
    robotPlaybackSessionRef.current += 1;
    cleanupOpenAiAudio();
    setRobotVoiceWave({
      active: false,
      word: "",
      progress: "",
      percent: 0,
      speaking: false,
      asking: false,
      explanation: "",
      messages: [],
    });
    setExplainingWordKey(null);
  }, [cleanupOpenAiAudio]);

  const speakRobotSegments = useCallback(async (
    word: string,
    segments: string[],
    completeText: string,
  ) => {
    if (!segments.length) return;
    const sessionId = robotPlaybackSessionRef.current + 1;
    robotPlaybackSessionRef.current = sessionId;
    robotStopRequestedRef.current = false;
    robotSegmentsRef.current = segments;

    let nextAudio = getOpenAiSpeechBlob(segments[0], openAiSpeechSpeed, openAiSpeechVoice);
    const retryCounts = new Map<number, number>();
    let i = 0;
    for (; i < segments.length;) {
      if (robotPlaybackSessionRef.current !== sessionId || robotStopRequestedRef.current) break;
      let startRatio = 0;
      const seekRequest = robotSeekRequestRef.current;
      if (seekRequest) {
        const rawIndex = Math.floor((seekRequest.percent / 100) * segments.length);
        i = Math.max(0, Math.min(segments.length - 1, rawIndex));
        startRatio = ((seekRequest.percent / 100) * segments.length) - i;
        robotSeekRequestRef.current = null;
        nextAudio = getOpenAiSpeechBlob(segments[i], openAiSpeechSpeed, openAiSpeechVoice);
      }

      const current = await nextAudio;
      if (robotPlaybackSessionRef.current !== sessionId || robotStopRequestedRef.current) break;
      nextAudio =
        i + 1 < segments.length
          ? getOpenAiSpeechBlob(segments[i + 1], openAiSpeechSpeed, openAiSpeechVoice)
          : Promise.resolve(current);
      setRobotVoiceWave((prev) => ({
        ...prev,
        active: true,
        word,
        speaking: true,
        progress: `${i + 1}/${segments.length}`,
      }));
      const result = await playSpeechBlob(current.blob, {
        onProgress: (currentTime, duration) => {
          const segmentRatio = duration > 0 ? currentTime / duration : 0;
          const percent = ((i + Math.max(0, Math.min(1, segmentRatio))) / segments.length) * 100;
          setRobotVoiceWave((prev) => ({ ...prev, percent }));
        },
        startRatio,
      });
      if (result === "ended") {
        retryCounts.delete(i);
        i += 1;
      } else if (robotSeekRequestRef.current) {
        continue;
      } else if (
        robotPlaybackSessionRef.current === sessionId &&
        !robotStopRequestedRef.current
      ) {
        const retryCount = retryCounts.get(i) || 0;
        if (retryCount < 2) {
          retryCounts.set(i, retryCount + 1);
          nextAudio = Promise.resolve(current);
          setFeedbackText(`播放被浏览器打断，正在自动续播 ${word}（${i + 1}/${segments.length}）`);
          continue;
        }
        setRobotVoiceWave((prev) => ({
          ...prev,
          speaking: false,
          progress: `已暂停 ${i + 1}/${segments.length}`,
        }));
        break;
      }
    }

    if (
      robotPlaybackSessionRef.current === sessionId &&
      !robotStopRequestedRef.current &&
      i >= segments.length
    ) {
      setRobotVoiceWave((prev) => ({
        ...prev,
        active: true,
        word,
        progress: "完成",
        percent: 100,
        speaking: false,
      }));
      setFeedbackText(completeText);
    }
  }, [openAiSpeechSpeed, openAiSpeechVoice, playSpeechBlob]);

  const seekRobotVoiceWave = useCallback((percent: number) => {
    const segments = robotSegmentsRef.current;
    if (!segments.length) return;
    const clampedPercent = Math.max(0, Math.min(100, percent));
    robotSeekRequestRef.current = { percent: clampedPercent };
    const word = robotContextRef.current.word || robotVoiceWave.word;
    const wasPlaying = Boolean(ttsAudioRef.current);
    cleanupOpenAiAudio();
    setRobotVoiceWave((prev) => ({
      ...prev,
      percent: clampedPercent,
      speaking: true,
      progress: "跳转中",
    }));
    if (!wasPlaying) {
      void speakRobotSegments(word, segments, "机器人播报完成，可以继续提问");
    }
  }, [cleanupOpenAiAudio, robotVoiceWave.word, speakRobotSegments]);

  const explainWord = useCallback(async (item: LexiconItem) => {
    const word = item.en.trim();
    if (!word || explainingWordKey) return;
    const uiKey = `${word}|${item.zh}`;
    setExplainingWordKey(uiKey);
    robotPlaybackSessionRef.current += 1;
    robotStopRequestedRef.current = false;
    robotSeekRequestRef.current = null;
    robotSegmentsRef.current = [];
    robotContextRef.current = {
      word,
      zh: item.zh,
      explanation: "",
      messages: [],
    };
    cleanupOpenAiAudio();
    setRobotVoiceWave({
      active: true,
      word,
      progress: "准备中",
      percent: 0,
      speaking: false,
      asking: false,
      explanation: "",
      messages: [],
    });
    setFeedbackText(`正在准备 ${word} 的记忆讲解...`);

    const messages = [
      {
        role: "system",
        content:
          "你是小学英语老师。请用中文给小学生讲解英语单词，语言要活泼、简单、好记。输出 4 到 6 句短句，不要编号，不要 Markdown。每句尽量不超过 35 个汉字。必须包含：中文意思、发音/拼写记忆窍门、一个很简单的英文例句和中文意思、鼓励跟读。",
      },
      {
        role: "user",
        content: `单词：${word}\n中文意思：${item.zh}`,
      },
    ];

    try {
      const source = selectedCloudProvider?.configured
        ? {
            type: "cloud" as const,
            providerId: selectedCloudProvider.id,
            model: cloudModel.trim() || selectedCloudProvider.defaultModel,
          }
        : {
            type: "local" as const,
            model: llmModelId || "web-llm",
          };
      const cacheKey = getExplanationCacheKey({
        en: word,
        zh: item.zh,
        source,
      });
      let explanation = readCachedExplanation(cacheKey) || "";
      if (explanation) {
        setFeedbackText(`正在播放 ${word} 的本地缓存讲解...`);
      }

      if (selectedCloudProvider?.configured) {
        if (!explanation) {
          setFeedbackText(`正在生成 ${word} 的记忆讲解...`);
          const resp = await fetch("/api/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: selectedCloudProvider.id,
              model: source.model,
              messages,
              temperature: 0.6,
              max_tokens: 360,
            }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            throw new Error(data?.error?.message || `讲解生成失败 (${resp.status})`);
          }
          explanation = data.choices?.[0]?.message?.content?.trim() || "";
          writeCachedExplanation(cacheKey, explanation);
        }
      } else if (llmEngine) {
        if (!explanation) {
          setFeedbackText(`正在生成 ${word} 的记忆讲解...`);
          const response = await llmEngine.chat.completions.create({
            messages,
            temperature: 0.6,
            max_tokens: 360,
          });
          explanation = response.choices?.[0]?.message?.content?.trim() || "";
          writeCachedExplanation(cacheKey, explanation);
        }
      } else {
        throw new Error("请先配置云端大模型，或加载本地大模型");
      }

      const segments = splitSpeechSegments(explanation);
      if (!segments.length) {
        throw new Error("讲解内容为空");
      }

      robotSegmentsRef.current = segments;
      robotContextRef.current = {
        word,
        zh: item.zh,
        explanation,
        messages: [],
      };
      setRobotVoiceWave((prev) => ({
        ...prev,
        active: true,
        word,
        progress: `0/${segments.length}`,
        percent: 0,
        speaking: true,
        explanation,
      }));

      setFeedbackText(`正在播放 ${word} 的讲解`);
      await speakRobotSegments(word, segments, `${word} 的讲解播放完成，可以继续和机器人提问`);
    } catch (err) {
      cleanupOpenAiAudio();
      setRobotVoiceWave((prev) => ({ ...prev, speaking: false, progress: "出错了" }));
      setFeedbackText(`讲解失败：${(err as Error).message || "请检查 AI 或语音配置"}`);
      console.error("word explanation failed:", err);
    } finally {
      setExplainingWordKey(null);
    }
  }, [
    cleanupOpenAiAudio,
    cloudModel,
    explainingWordKey,
    llmEngine,
    llmModelId,
    openAiSpeechSpeed,
    playSpeechBlob,
    selectedCloudProvider,
    speakRobotSegments,
  ]);

  const askRobotTeacher = useCallback(async (message: string) => {
    const question = message.trim();
    const context = robotContextRef.current;
    if (!question || !context.word) return;

    robotStopRequestedRef.current = true;
    robotPlaybackSessionRef.current += 1;
    cleanupOpenAiAudio();
    const nextMessages: RobotChatMessage[] = [
      ...context.messages,
      { role: "user", content: question },
    ];
    robotContextRef.current = {
      ...context,
      messages: nextMessages,
    };
    setRobotVoiceWave((prev) => ({
      ...prev,
      active: true,
      asking: true,
      speaking: false,
      messages: nextMessages,
    }));
    setFeedbackText(`机器人正在思考：${question}`);

    const modeLabel =
      playMode === "voice_match" ? "释义匹配" : playMode === "spell_word" ? "拼单词" : "飞机射击";
    const lexiconContext = parseLexiconEntries(wordInput)
      .slice(0, 40)
      .map((item) => `${item.en}=${item.zh}`)
      .join("\n");
    const aiMessages = [
      {
        role: "system",
        content:
          "你是一个有机器人口吻的小学英语老师。请用中文回答孩子的问题，简单、亲切、有画面感。每次回答 2 到 4 句短句，不要 Markdown。回答必须围绕当前单词和已有讲解，不要假装没有上下文。",
      },
      {
        role: "user",
        content:
          `完整互动上下文如下：\n` +
          `当前单词：${context.word}\n` +
          `中文释义：${context.zh}\n` +
          `当前游戏模式：${modeLabel}\n` +
          `当前词库：\n${lexiconContext || "暂无"}\n` +
          `机器人刚才的讲解：${context.explanation || "暂无"}\n` +
          `请基于这些上下文继续陪小学生学习。`,
      },
      ...nextMessages,
    ];

    try {
      let answer = "";
      if (selectedCloudProvider?.configured) {
        const resp = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedCloudProvider.id,
            model: cloudModel.trim() || selectedCloudProvider.defaultModel,
            messages: aiMessages,
            temperature: 0.65,
            max_tokens: 260,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data?.error?.message || `机器人对话失败 (${resp.status})`);
        }
        answer = data.choices?.[0]?.message?.content?.trim() || "";
      } else if (llmEngine) {
        const response = await llmEngine.chat.completions.create({
          messages: aiMessages,
          temperature: 0.65,
          max_tokens: 260,
        });
        answer = response.choices?.[0]?.message?.content?.trim() || "";
      } else {
        throw new Error("请先配置云端大模型，或加载本地大模型");
      }

      if (!answer) throw new Error("机器人没有生成回答");
      const updatedMessages: RobotChatMessage[] = [
        ...nextMessages,
        { role: "assistant", content: answer },
      ];
      robotContextRef.current = {
        ...context,
        messages: updatedMessages,
      };
      setRobotVoiceWave((prev) => ({
        ...prev,
        active: true,
        asking: false,
        messages: updatedMessages,
      }));
      await speakRobotSegments(context.word, splitSpeechSegments(answer, 80), "机器人回答播放完成，可以继续提问");
    } catch (err) {
      const errorText = `机器人回答失败：${(err as Error).message || "请检查 AI 配置"}`;
      setRobotVoiceWave((prev) => ({
        ...prev,
        asking: false,
        speaking: false,
        messages: [
          ...nextMessages,
          { role: "assistant", content: errorText },
        ],
      }));
      setFeedbackText(errorText);
      console.error("robot teacher chat failed:", err);
    }
  }, [
    cloudModel,
    cleanupOpenAiAudio,
    llmEngine,
    playMode,
    selectedCloudProvider,
    speakRobotSegments,
    wordInput,
  ]);

  const askRobotTeacherByVoice = useCallback(async (audio: Blob) => {
    const context = robotContextRef.current;
    if (!context.word) {
      throw new Error("请先打开一个单词讲解，再发送语音消息");
    }

    robotStopRequestedRef.current = true;
    robotPlaybackSessionRef.current += 1;
    cleanupOpenAiAudio();
    setRobotVoiceWave((prev) => ({
      ...prev,
      active: true,
      speaking: false,
      asking: true,
    }));
    setFeedbackText("机器人正在识别你的语音...");

    const recentMessages = context.messages
      .slice(-6)
      .map((item) => `${item.role === "user" ? "孩子" : "机器人"}：${item.content}`)
      .join("\n");
    const formData = new FormData();
    formData.set("file", audio, `robot-message-${Date.now()}.webm`);
    formData.set("response_format", "json");
    formData.set(
      "prompt",
      [
        "这是小学生和英语学习机器人之间的语音提问。",
        `当前单词：${context.word}`,
        `中文释义：${context.zh}`,
        `机器人刚才的讲解：${context.explanation || "暂无"}`,
        recentMessages ? `最近对话：\n${recentMessages}` : "",
        "请优先识别中文，也可能夹杂少量英文单词。",
      ].filter(Boolean).join("\n"),
    );

    const resp = await fetch("/api/v1/audio/transcriptions", {
      method: "POST",
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setRobotVoiceWave((prev) => ({ ...prev, asking: false }));
      throw new Error(data?.error?.message || `语音识别失败 (${resp.status})`);
    }

    const text = String(data.text || "").trim();
    if (!text) {
      setRobotVoiceWave((prev) => ({ ...prev, asking: false }));
      throw new Error("没有识别到内容，请靠近麦克风再试一次");
    }

    setFeedbackText(`识别到：${text}`);
    await askRobotTeacher(text);
  }, [askRobotTeacher, cleanupOpenAiAudio]);

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

  const inputSpellCharacter = useCallback((rawChar: string) => {
    const tid = spellTargetIdRef.current;
    const target = tid ? wordsRef.current.find((w) => w.id === tid && w.status === "live") : null;
    if (!target) return;

    const typedChar = rawChar.toLowerCase();
    const limit = getSpellChallengeInputLimit(target);
    setSpellInput((prev) => {
      if (prev.length >= limit) return prev;
      if (target.spellChallengeMode === "missing_letters") {
        const expected = getSpellChallengeAnswer(target)[prev.length];
        const wordIndex = getLetterIndexByTypedPosition(target.en, prev.length);
        if (expected !== typedChar) {
          setFeedbackText(`这里应该输入 ${expected}`);
          return prev;
        }
        if (wordIndex >= 0 && !target.missingLetterIndexes.includes(wordIndex)) {
          setSpellPulseIndex(wordIndex);
          window.setTimeout(() => setSpellPulseIndex(null), 180);
        }
      }
      return [...prev, typedChar];
    });
  }, [setSpellInput]);

  // ---- 拼单词模式：确认拼写（可接受外部传入的字母，供语音回调使用） ----
  const confirmSpell = useCallback((overrideLetters?: string[]) => {
    const tid = spellTargetIdRef.current;
    if (!tid) return;
    const target = wordsRef.current.find((w) => w.id === tid && w.status === "live");
    if (!target) { pickNextSpellTarget(); return; }

    const letters = overrideLetters || spellInputRef.current;
    const typed = letters.join("").toLowerCase().replace(/\s+/g, " ").trim();
    const correct = getSpellChallengeAnswer(target);

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
      setFeedbackText(
        target.spellChallengeMode === "missing_letters"
          ? `填空错误！请按顺序输入: ${correct}`
          : `拼写错误！正确: ${target.en}`,
      );
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
  }, [pickNextSpellTarget, emitLikeBurst, bumpStudyHistory, bumpBatchResult]);

  // ---- 拼单词模式：跳过当前单词，记为失败 ----
  const skipSpell = useCallback(() => {
    const tid = spellTargetIdRef.current;
    if (!tid) return;
    const target = wordsRef.current.find((w) => w.id === tid && w.status === "live");
    if (!target) { pickNextSpellTarget(); return; }

    setWords((prev) => {
      const updated = prev.map((w) =>
        w.id === tid ? { ...w, status: "missed" as const, revealedEn: true } : w
      );
      wordsRef.current = updated;
      return updated;
    });

    const key = `${target.normalized}|${target.zh}`;
    setMistakeMap((prevMap) => {
      const existing = prevMap[key];
      return {
        ...prevMap,
        [key]: { key, en: target.en, zh: target.zh, count: (existing?.count || 0) + 1 },
      };
    });
    bumpStudyHistory({ en: target.en, zh: target.zh }, "wrong");
    bumpBatchResult("wrong");
    setStreak(0);
    setDoneCount((v) => v + 1);
    setFeedbackText(`已跳过：${target.en}`);
    setSpellInput([]);
    setTimeout(() => pickNextSpellTarget(), 200);
  }, [pickNextSpellTarget, bumpStudyHistory, bumpBatchResult, setSpellInput]);

  const stopSpeech = useCallback(() => {
    if (gameSpeechRestartTimerRef.current) {
      window.clearTimeout(gameSpeechRestartTimerRef.current);
      gameSpeechRestartTimerRef.current = null;
    }
    const recorder = gameSpeechRecorderRef.current;
    if (recorder) {
      gameSpeechRecorderRef.current = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // ignore
      }
    }
    gameSpeechStreamRef.current?.getTracks().forEach((track) => track.stop());
    gameSpeechStreamRef.current = null;

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
      const durationMs = normalizeGameDuration(roundSeconds) * 1000;
      roundDurationRef.current = durationMs;
      setCountdownMs(durationMs);
      setRecognizedText(nextId ? "正在监听中..." : "");

      if (nextId) {
        setFeedbackText("请说出对应的英文单词");
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
      // voice_match 模式不停止语音，保持持续监听
      if (playModeRef.current !== "voice_match") {
        stopSpeech();
      }

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
    (raw: string, alternatives: string[] = []) => {
      if (!raw) return;

      const rawCandidates = [raw, ...alternatives].map((item) => item.trim()).filter(Boolean);
      setRecognizedText(`识别结果：${rawCandidates.join(" / ")}`);
      const normalizedInputs = rawCandidates.map(normalizeText).filter(Boolean);
      const normalized = normalizedInputs[0] || "";
      const liveWords = wordsRef.current;
      const candidates = liveWords.filter((w) => w.status === "live");
      if (!candidates.length) return;

      if (playMode === "plane_shooter") {
        let bestShooter: { word: WordItem; score: number } | null = null;
        for (const c of candidates) {
          const score = Math.max(...normalizedInputs.map((input) => similarity(input, c.normalized)));
          if (!bestShooter || score > bestShooter.score) {
            bestShooter = { word: c, score };
          }
        }
        if (!bestShooter) return;
        // 飞机模式用更宽容的判定，提升真实语音场景可触发率。
        const containsCandidate = candidates.find(
          (c) =>
            normalizedInputs.some((input) => input.includes(c.normalized) || c.normalized.includes(input)),
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
        (c) => normalizedInputs.some((input) => input.includes(c.normalized) || c.normalized.includes(input)),
      );

      let best: { word: WordItem; score: number } | null = null;
      for (const c of candidates) {
        const score = Math.max(...normalizedInputs.map((input) => similarity(input, c.normalized)));
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
    [lockPlaneTarget, playMode, resolveRound, setSpellInput],
  );

  // ---- WebLLM: 加载模型 ----
  const loadLlmModel = useCallback(async () => {
    if (!llmModelId || llmStatus === "loading") return;
    setLlmStatus("loading");
    setLlmProgress("正在初始化...");

    const { CreateMLCEngine, prebuiltAppConfig } = await import("@mlc-ai/web-llm");
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

    // 自动重试：已缓存的分片会被跳过，只下载剩余文件
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const engine = await CreateMLCEngine(llmModelId, {
          appConfig: mirrorAppConfig,
          initProgressCallback: (progress) => {
            const prefix = attempt > 1 ? `[重试 ${attempt}/${MAX_RETRIES}] ` : "";
            setLlmProgress(prefix + (progress.text || "加载中..."));
          },
        });
        setLlmEngine(engine);
        setLlmStatus("ready");
        setLlmProgress("");
        return;
      } catch (err) {
        console.error(`WebLLM load attempt ${attempt}/${MAX_RETRIES} failed:`, err);
        if (attempt < MAX_RETRIES) {
          setLlmProgress(`加载中断，${3}秒后自动重试 (${attempt}/${MAX_RETRIES})...`);
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          setLlmStatus("error");
          setLlmProgress(`加载失败（已重试${MAX_RETRIES}次）: ${err}`);
        }
      }
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

  const appendGeneratedLexicon = useCallback((text: string) => {
    const lines = text
      .split("\n")
      .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter((line: string) => line.includes("="));
    if (!lines.length) return;
    setWordInput((prev) => {
      const existing = prev.trim();
      return existing ? `${existing}\n${lines.join("\n")}` : lines.join("\n");
    });
  }, []);

  const extractLexiconLines = useCallback((text: string): string[] => {
    return text
      .split("\n")
      .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter((line: string) => /^[^=\n]+=[^=\n]+$/.test(line));
  }, []);

  // 用本地或云端 LLM 生成词库
  const generateWordsWithLlm = useCallback(async () => {
    if (llmGenerating) return;
    const topic = llmTopic.trim() || "日常生活";
    const messages = [
      {
        role: "system",
        content:
          "You are an English vocabulary generator. Output ONLY lines in the format: english=中文翻译\nNo numbering, no extra text. Generate 10 useful English words or phrases for the given topic.",
      },
      {
        role: "user",
        content: `Topic: ${topic}`,
      },
    ];
    setLlmGenerating(true);
    try {
      if (selectedCloudProvider?.configured) {
        const resp = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedCloudProvider.id,
            model: cloudModel.trim() || selectedCloudProvider.defaultModel,
            messages,
            temperature: 0.8,
            max_tokens: 300,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data?.error?.message || `云端模型请求失败 (${resp.status})`);
        }
        const text = data.choices?.[0]?.message?.content?.trim() || "";
        appendGeneratedLexicon(text);
        return;
      }

      if (!llmEngine) return;
      const response = await llmEngine.chat.completions.create({
        messages,
        temperature: 0.8,
        max_tokens: 300,
      });
      const text = response.choices?.[0]?.message?.content?.trim() || "";
      appendGeneratedLexicon(text);
    } catch (err) {
      console.error("LLM generation failed:", err);
      setFeedbackText(`AI 生成失败：${(err as Error).message || "请检查模型配置"}`);
    } finally {
      setLlmGenerating(false);
    }
  }, [
    appendGeneratedLexicon,
    cloudModel,
    llmEngine,
    llmGenerating,
    llmTopic,
    selectedCloudProvider,
  ]);

  const normalizeLexiconWithAi = useCallback(async () => {
    const raw = wordInput.trim();
    if (!raw || lexiconNormalizing) return;
    if (!selectedCloudProvider?.configured && !llmEngine) {
      setFeedbackText("请先配置云端大模型，或加载本地大模型后再智能识别");
      return;
    }

    const messages = [
      {
        role: "system",
        content:
          "你是英语词库格式整理助手。请从用户输入中识别英语单词或短语，并补全准确简洁的中文释义。只输出标准词库文本，每行一个：英文=中文。不要编号，不要 Markdown，不要解释。英文保留小写或常见自然大小写，去重，中文释义简短准确。",
      },
      {
        role: "user",
        content: `请整理以下词库内容：\n${raw}`,
      },
    ];

    setLexiconNormalizing(true);
    setFeedbackText("AI 正在智能识别词库格式...");
    try {
      let text = "";
      if (selectedCloudProvider?.configured) {
        const resp = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedCloudProvider.id,
            model: cloudModel.trim() || selectedCloudProvider.defaultModel,
            messages,
            temperature: 0.2,
            max_tokens: 900,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data?.error?.message || `智能识别失败 (${resp.status})`);
        }
        text = data.choices?.[0]?.message?.content?.trim() || "";
      } else {
        const response = await llmEngine.chat.completions.create({
          messages,
          temperature: 0.2,
          max_tokens: 900,
        });
        text = response.choices?.[0]?.message?.content?.trim() || "";
      }

      const lines = extractLexiconLines(text);
      if (!lines.length) throw new Error("AI 没有返回可用的词库格式");
      setWordInput(lines.join("\n"));
      setFeedbackText(`智能识别完成，共整理 ${lines.length} 个词条`);
    } catch (err) {
      console.error("Lexicon normalization failed:", err);
      setFeedbackText(`智能识别失败：${(err as Error).message || "请稍后重试"}`);
    } finally {
      setLexiconNormalizing(false);
    }
  }, [
    cloudModel,
    extractLexiconLines,
    lexiconNormalizing,
    llmEngine,
    selectedCloudProvider,
    wordInput,
  ]);

  const getOpenAiPronunciationCandidates = useCallback(async (transcript: string) => {
    const liveWords = wordsRef.current
      .filter((word) => word.status === "live")
      .map((word) => word.en);
    if (!liveWords.length) return [];

    const openAiProvider = cloudProviders.find((provider) => provider.id === "openai");
    const messages = [
      {
        role: "system",
        content:
          "You help match children's spoken English to a fixed vocabulary list. Given a speech transcript and candidate words, return ONLY candidate English words or phrases from the list that may have the same or very similar pronunciation. One per line. No explanations.",
      },
      {
        role: "user",
        content: `Transcript: ${transcript}\nCandidate list:\n${liveWords.join("\n")}`,
      },
    ];

    const resp = await fetch("/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: openAiProvider?.defaultModel || "gpt-4o-mini",
        messages,
        temperature: 0.1,
        max_tokens: 160,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error?.message || `OpenAI 候选词匹配失败 (${resp.status})`);
    }
    const allowed = new Set(liveWords.map((word) => normalizeText(word)));
    return String(data.choices?.[0]?.message?.content || "")
      .split("\n")
      .map((line) => line.replace(/^[-*\d\.\)\s]+/, "").trim())
      .filter((line) => allowed.has(normalizeText(line)));
  }, [cloudProviders]);

  const transcribeGameSpeechWithOpenAi = useCallback(async (blob: Blob) => {
    if (blob.size < 800) return;
    const liveWords = wordsRef.current
      .filter((word) => word.status === "live")
      .map((word) => word.en);
    const formData = new FormData();
    formData.set("file", blob, `game-speech-${Date.now()}.webm`);
    formData.set("response_format", "json");
    formData.set("language", "en");
    formData.set(
      "prompt",
      [
        "A child is speaking one English word or phrase in a vocabulary game.",
        "Possible answers:",
        liveWords.join(", "),
      ].join("\n"),
    );

    setRecognizedText("OpenAI 正在识别...");
    const resp = await fetch("/api/v1/audio/transcriptions", {
      method: "POST",
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error?.message || `OpenAI 语音识别失败 (${resp.status})`);
    }

    const transcript = String(data.text || "").trim();
    if (!transcript) return;
    let alternatives: string[] = [];
    try {
      alternatives = await getOpenAiPronunciationCandidates(transcript);
    } catch (err) {
      console.warn("OpenAI pronunciation candidates failed:", err);
    }
    tryMatchSpeech(transcript, alternatives);
  }, [getOpenAiPronunciationCandidates, tryMatchSpeech]);

  const startOpenAiGameSpeech = useCallback(async () => {
    stopSpeech();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setFeedbackText("当前浏览器不支持录音，无法使用 OpenAI 语音识别");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setFeedbackText("当前浏览器不支持语音消息，无法使用 OpenAI 语音识别");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      gameSpeechStreamRef.current = stream;
      gameSpeechChunksRef.current = [];
      const mimeType = GAME_SPEECH_AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      gameSpeechRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) gameSpeechChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setFeedbackText("OpenAI 语音录制失败，请重试");
      };
      recorder.onstop = () => {
        const chunks = gameSpeechChunksRef.current;
        gameSpeechChunksRef.current = [];
        gameSpeechStreamRef.current?.getTracks().forEach((track) => track.stop());
        gameSpeechStreamRef.current = null;
        gameSpeechRecorderRef.current = null;

        if (chunks.length) {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          void transcribeGameSpeechWithOpenAi(blob).catch((err) => {
            console.error("OpenAI game speech failed:", err);
            setFeedbackText(`OpenAI 语音识别失败：${(err as Error).message || "请检查服务端配置"}`);
          });
        }

        if (
          gameSpeechEngineRef.current === "openai" &&
          gameStateRef.current === "running" &&
          autoListenRef.current &&
          (playModeRef.current === "voice_match" || askingRef.current)
        ) {
          gameSpeechRestartTimerRef.current = window.setTimeout(() => {
            void startOpenAiGameSpeech();
          }, 180);
        }
      };

      recorder.start();
      setRecognizedText(autoListenRef.current ? "OpenAI 正在监听中..." : "OpenAI 正在录音...（松开结束）");
      if (autoListenRef.current) {
        gameSpeechRestartTimerRef.current = window.setTimeout(() => {
          if (gameSpeechRecorderRef.current?.state === "recording") {
            gameSpeechRecorderRef.current.stop();
          }
        }, 2200);
      }
    } catch {
      setFeedbackText("无法使用麦克风，请检查浏览器权限");
    }
  }, [gameState, stopSpeech, transcribeGameSpeechWithOpenAi]);

  const startSpeech = useCallback(() => {
    if (gameSpeechEngineRef.current === "openai") {
      void startOpenAiGameSpeech();
      return;
    }

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
      if (
        gameStateRef.current === "running" &&
        (playModeRef.current === "voice_match" || askingRef.current) &&
        (spaceHoldRef.current || autoListenRef.current)
      ) {
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
      setRecognizedText(autoListenRef.current ? "正在监听中..." : "正在监听...（按住空格）");
    } catch {
      setSpeechSupported(false);
    }
  }, [startOpenAiGameSpeech, stopSpeech, tryMatchSpeech]);

  const endGame = useCallback(() => {
    gameStateRef.current = "ended";
    setGameState("ended");
    setTargetId(null);
    setPlaneTargetId(null);
    targetRef.current = null;
    planeTargetIdRef.current = null;
    askingRef.current = false;
    spaceHoldRef.current = false;
    autoListenRef.current = false;
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
    const safeRoundSeconds = normalizeGameDuration(roundSeconds);
    setRoundSeconds(safeRoundSeconds);
    roundDurationRef.current = safeRoundSeconds * 1000;

    const batchEntries = parsed.map((w) => ({ en: w.en, zh: w.zh }));
    addSeenHistoryBatch(batchEntries);
    registerStudyBatch(batchEntries);

    gameStateRef.current = "running";
    setGameState("running");
    setTotalCount(parsed.length);
    setDoneCount(0);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setTimeBoost(0);
    setFeedbackText(
      playMode === "voice_match"
        ? planeDropChineseOnly
          ? "中文下落模式：看下落中文，说出对应英文"
          : "开局成功，准备进入第一题"
        : playMode === "spell_word"
          ? spellChallengeMode === "missing_letters"
            ? "看单词缺失字母提示，输入缺失字母后按回车确认"
            : "看中文提示，在键盘上拼出正确的英文单词，按回车确认"
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
    const baseSpeed = fallDistance / safeRoundSeconds;
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
          missingLetterIndexes: createMissingLetterIndexes(w.en),
          spellChallengeMode,
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
      setRecognizedText(isTouchDevice ? "正在自动监听..." : "按住空格开始监听...");
      setCountdownMs(0);
    }

    // 释义匹配：所有设备自动开启语音识别；其他语音模式仅触摸设备自动开启
    if (playMode === "voice_match" || (isTouchDevice && playMode === "plane_shooter")) {
      autoListenRef.current = true;
      startSpeech();
    }

    clearRaf();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [wordInput, playMode, fallHeightPx, addSeenHistoryBatch, registerStudyBatch, nextRound, clearRaf, gameLoop, roundSeconds, planeDropChineseOnly, spellChallengeMode, pickNextSpellTarget, isTouchDevice, startSpeech]);

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
          inputSpellCharacter(event.key);
          return;
        }
        if (event.key === " " && !event.repeat) {
          event.preventDefault();
          // 仅当目标是词组（含空格）时才接受空格输入
          const tid = spellTargetIdRef.current;
          const target = tid ? wordsRef.current.find((w) => w.id === tid) : null;
          if (target && target.spellChallengeMode === "shuffle" && /\s/.test(target.normalized)) {
            setSpellInput((prev) => (prev.length > 0 && prev[prev.length - 1] !== " " ? [...prev, " "] : prev));
          }
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
      // voice_match 模式始终自动监听，不需要按空格
      if (playMode === "voice_match") return;
      const canListen =
        gameState === "running" &&
        (askingRef.current && (playMode === "plane_shooter" || Boolean(targetRef.current)));
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
      // voice_match 模式始终自动监听，不需要按空格
      if (playMode === "voice_match") return;
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
  }, [firePlaneBullet, gameState, playMode, startSpeech, stopSpeech, confirmSpell, inputSpellCharacter]);

  useEffect(() => {
    return () => {
      clearRaf();
      stopSpeech();
      if (ttsTimerRef.current) {
        window.clearTimeout(ttsTimerRef.current);
        ttsTimerRef.current = null;
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = "";
        ttsAudioRef.current = null;
      }
      if (ttsObjectUrlRef.current) {
        URL.revokeObjectURL(ttsObjectUrlRef.current);
        ttsObjectUrlRef.current = null;
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
      <RobotVoiceWave
        active={robotVoiceWave.active}
        word={robotVoiceWave.word}
        progress={robotVoiceWave.progress}
        percent={robotVoiceWave.percent}
        speaking={robotVoiceWave.speaking}
        asking={robotVoiceWave.asking}
        messages={robotVoiceWave.messages}
        onClose={closeRobotVoiceWave}
        onSeek={seekRobotVoiceWave}
        onAsk={askRobotTeacher}
        onVoiceAsk={askRobotTeacherByVoice}
      />
      {showBrowserWarning && (
        <BrowserWarning onClose={() => setShowBrowserWarning(false)} />
      )}
      <div className="mx-auto max-w-6xl px-3 pb-8 pt-4 sm:px-4 sm:pt-6 md:px-6 md:pt-8">
        <AppHeader llmStatus={llmStatus} onOpenChat={() => setLlmChatOpen(true)} />

        <ModeSelector
          playMode={playMode}
          gameState={gameState}
          onModeChange={setPlayMode}
        />

        <LexiconAndStartPanel
          scenarios={SCENARIOS}
          gameState={gameState}
          playMode={playMode}
          wordInput={wordInput}
          lexiconLabels={lexiconLabels}
          llmStatus={llmStatus}
          aiGenerationAvailable={aiGenerationAvailable}
          aiGenerationLabel={aiGenerationLabel}
          llmTopic={llmTopic}
          llmGenerating={llmGenerating}
          lexiconNormalizing={lexiconNormalizing}
          openAiSpeechVoice={openAiSpeechVoice}
          openAiSpeechVoices={OPENAI_TTS_VOICES}
          openAiSpeechSpeed={openAiSpeechSpeed}
          explainingWordKey={explainingWordKey}
          timeBoost={timeBoost}
          roundSeconds={roundSeconds}
          planeDropChineseOnly={planeDropChineseOnly}
          gameSpeechEngine={gameSpeechEngine}
          spellChallengeMode={spellChallengeMode}
          onWordInputChange={setWordInput}
          onLoadScenario={loadScenario}
          onLlmTopicChange={setLlmTopic}
          onGenerateWordsWithLlm={generateWordsWithLlm}
          onNormalizeLexiconWithAi={normalizeLexiconWithAi}
          onOpenAiSpeechVoiceChange={setOpenAiSpeechVoice}
          onOpenAiSpeechSpeedChange={setOpenAiSpeechSpeed}
          onSpeakText={speakText}
          onExplainWord={explainWord}
          onStart={openGameModalAndStart}
          onStop={stopGame}
          onUseTimeBoost={useTimeBoost}
          onRoundSecondsChange={setRoundSeconds}
          onPlaneDropChineseOnlyChange={setPlaneDropChineseOnly}
          onGameSpeechEngineChange={(engine) => {
            gameSpeechEngineRef.current = engine;
            setGameSpeechEngine(engine);
          }}
          onSpellChallengeModeChange={setSpellChallengeMode}
        />

        <ReviewPanels
          mistakeList={mistakeList}
          studyBatchList={studyBatchList}
          gameState={gameState}
          onLoadMistakePractice={loadMistakePractice}
          onClearMistakes={() => setMistakeMap({})}
          onLoadBatchPractice={loadBatchPractice}
          onClearBatches={() => setStudyBatchMap({})}
          onSpeakText={speakText}
        />

        <LlmSettingsPanel
          dropdownRef={llmDropdownRef}
          llmDropdownOpen={llmDropdownOpen}
          llmModelFilter={llmModelFilter}
          llmModelId={llmModelId}
          llmStatus={llmStatus}
          llmProgress={llmProgress}
          llmAvailableModels={llmAvailableModels}
          filteredLlmModels={filteredLlmModels}
          selectedModelCached={selectedModelCached}
          cloudProviders={cloudProviders}
          cloudProviderId={cloudProviderId}
          onDropdownOpenChange={setLlmDropdownOpen}
          onModelFilterChange={setLlmModelFilter}
          onModelChange={setLlmModelId}
          onLoadModel={loadLlmModel}
          onCloudProviderChange={(providerId) => {
            setCloudProviderId(providerId);
            const provider = cloudProviders.find((item) => item.id === providerId);
            setCloudModel(provider?.defaultModel || "");
          }}
        />

        {isGameModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-slate-950/75">
            <div className="relative flex h-full w-full flex-col overflow-hidden border border-indigo-200/35 bg-slate-950/95 shadow-2xl">
              <div className="flex flex-col gap-2 border-b border-indigo-300/30 bg-slate-950/95 px-3 py-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 sm:px-4 sm:py-3">
                {/* 顶行：模式名 + 倒计时 + 关闭 */}
                <div className="flex items-center justify-between gap-2 sm:justify-self-start">
                  <div>
                    <p className="text-xs font-semibold text-indigo-100 sm:text-sm">
                      {playMode === "voice_match" ? "释义匹配" : playMode === "spell_word" ? "拼单词" : "飞机射击"}
                    </p>
                    <p className="hidden text-xs text-indigo-200/80 sm:block">
                      {gameState === "running"
                        ? playMode === "spell_word"
                          ? "用键盘拼出正确单词，按回车确认"
                          : playMode === "voice_match"
                            ? "语音识别已开启，请直接说英文"
                            : isTouchDevice
                              ? "游戏进行中（自动语音识别）"
                              : "游戏进行中（按住空格可语音识别）"
                        : "可开始新一局或查看本局成绩"}
                    </p>
                  </div>
                  {/* 手机端：倒计时+关闭按钮放在模式名旁 */}
                  <div className="flex items-center gap-1.5 sm:hidden">
                    {playMode === "voice_match" && (
                      <div className="rounded-md border border-amber-300/35 bg-amber-500/10 px-2 py-0.5 text-right">
                        <p className="text-[9px] leading-tight text-amber-100/80">倒计时</p>
                        <p className="text-xs font-bold leading-tight text-amber-100">
                          {gameState === "running" ? `${(countdownMs / 1000).toFixed(1)}s` : `${roundSeconds}s`}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={closeGameModal}
                      className="rounded-md border border-indigo-300/40 px-2 py-1 text-[11px] font-semibold text-indigo-100 transition hover:bg-indigo-400/20"
                    >
                      {gameState === "running" ? "结束" : "关闭"}
                    </button>
                  </div>
                </div>

                {/* 中文释义（仅 voice_match）：手机端占满宽度 */}
                {playMode === "voice_match" ? (
                  <div className="flex items-center justify-center gap-2 sm:justify-self-center">
                    <div className="flex-1 rounded-xl border-2 border-emerald-300/60 bg-gradient-to-br from-emerald-500/25 via-emerald-400/15 to-teal-500/20 px-3 py-1.5 shadow-lg shadow-emerald-500/20 backdrop-blur-sm sm:max-w-[48vw] sm:flex-initial sm:rounded-2xl sm:px-6 sm:py-2.5">
                      <p className="truncate text-center text-xl font-extrabold tracking-wide text-emerald-50 drop-shadow-[0_2px_8px_rgba(16,185,129,0.6)] sm:text-3xl">
                        {currentMeaning || "准备开始..."}
                      </p>
                    </div>
                    {gameState === "running" && targetId && (
                      <button
                        type="button"
                        onClick={() => resolveRound("miss")}
                        className="flex-shrink-0 rounded-lg border border-indigo-300/40 bg-indigo-500/15 px-2 py-1.5 text-[11px] font-medium text-indigo-200/90 transition hover:bg-indigo-500/30 hover:text-white sm:px-2.5 sm:text-xs"
                        title="跳过当前词"
                      >
                        跳过 ⏭
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="hidden sm:block" />
                )}

                {/* 桌面端右侧：倒计时+关闭 */}
                <div className="hidden items-center justify-self-end gap-2 sm:flex">
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
                    } else if (word.spellChallengeMode === "missing_letters") {
                      const missing = new Set(word.missingLetterIndexes);
                      displayText = `${Array.from(word.en.toLowerCase())
                        .map((ch, idx) => (missing.has(idx) ? "_" : ch))
                        .join("")}  (${word.zh})`;
                    } else {
                      // Show: scrambled letters + chinese meaning
                      displayText = `${word.shuffledEn}  (${word.zh})`;
                    }
                  } else if (playMode === "plane_shooter") {
                    displayText = word.revealedEn ? word.en : word.zh;
                  } else if (playMode === "voice_match" && planeDropChineseOnly) {
                    displayText = word.zh;
                  } else {
                    displayText = word.en;
                  }

                  const spellClickable = playMode === "spell_word" && !word.exploding;
                  return (
                    <div
                      key={word.id}
                      onClick={spellClickable ? () => speakText(word.en) : undefined}
                      title={spellClickable ? `点击朗读：${word.en}` : undefined}
                      className={[
                        "absolute top-0 rounded-xl border px-3 py-1.5 text-lg font-bold tracking-wide shadow",
                        isPlaneTarget ? "bg-rose-900/90" : isSpellTarget ? "bg-amber-900/90" : "bg-blue-950/90",
                        baseClass,
                        isVoiceTarget ? "border-emerald-300 shadow-emerald-400/30" : "",
                        isPlaneTarget ? "border-rose-300 shadow-rose-400/30" : "",
                        isSpellTarget ? "border-amber-300 shadow-amber-400/40" : "",
                        word.spellUnlocked ? "border-emerald-400 bg-emerald-900/80" : "",
                        word.exploding ? "animate-boom" : "",
                        spellClickable ? "cursor-pointer hover:brightness-125 active:scale-95 transition" : "",
                      ].join(" ")}
                      style={{ left: `${word.x}px`, transform: `translateY(${word.y}px)` }}
                    >
                      {playMode === "spell_word" && isSpellTarget && word.spellChallengeMode === "missing_letters" ? (
                        <span className="flex items-center gap-1">
                          {Array.from(word.en.toLowerCase()).map((ch, idx) => {
                            const missing = word.missingLetterIndexes.includes(idx);
                            if (ch === " ") {
                              return (
                                <span key={idx} className="mx-1 text-sm font-normal text-amber-200/70">
                                  /
                                </span>
                              );
                            }
                            return (
                              <span
                                key={idx}
                                className={`inline-flex h-7 w-6 items-center justify-center rounded border text-base ${
                                  missing
                                    ? "border-dashed border-emerald-300/70 bg-emerald-950/50 text-emerald-100"
                                    : "border-amber-300/45 bg-amber-950/60 text-amber-100"
                                }`}
                              >
                                {missing ? "_" : ch}
                              </span>
                            );
                          })}
                          <span className="ml-1.5 text-sm font-normal text-amber-200/70">({word.zh})</span>
                        </span>
                      ) : playMode === "spell_word" && isSpellTarget ? (
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

                {/* 飞机射击模式：触摸设备左下角左右移动键 */}
                {playMode === "plane_shooter" && gameState === "running" && isTouchDevice && (
                  <div className="absolute bottom-4 left-4 z-[20] flex select-none items-end gap-3">
                    <button
                      type="button"
                      aria-label="左移"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        leftPressedRef.current = true;
                        planeMoveDirRef.current = rightPressedRef.current ? 0 : -1;
                      }}
                      onPointerUp={(e) => {
                        e.preventDefault();
                        leftPressedRef.current = false;
                        planeMoveDirRef.current = rightPressedRef.current ? 1 : 0;
                      }}
                      onPointerCancel={() => {
                        leftPressedRef.current = false;
                        planeMoveDirRef.current = rightPressedRef.current ? 1 : 0;
                      }}
                      onPointerLeave={() => {
                        if (leftPressedRef.current) {
                          leftPressedRef.current = false;
                          planeMoveDirRef.current = rightPressedRef.current ? 1 : 0;
                        }
                      }}
                      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-indigo-300/60 bg-slate-900/80 text-3xl text-indigo-100 shadow-lg backdrop-blur-sm transition active:scale-95 active:bg-indigo-600/60"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label="右移"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        rightPressedRef.current = true;
                        planeMoveDirRef.current = leftPressedRef.current ? 0 : 1;
                      }}
                      onPointerUp={(e) => {
                        e.preventDefault();
                        rightPressedRef.current = false;
                        planeMoveDirRef.current = leftPressedRef.current ? -1 : 0;
                      }}
                      onPointerCancel={() => {
                        rightPressedRef.current = false;
                        planeMoveDirRef.current = leftPressedRef.current ? -1 : 0;
                      }}
                      onPointerLeave={() => {
                        if (rightPressedRef.current) {
                          rightPressedRef.current = false;
                          planeMoveDirRef.current = leftPressedRef.current ? -1 : 0;
                        }
                      }}
                      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-indigo-300/60 bg-slate-900/80 text-3xl text-indigo-100 shadow-lg backdrop-blur-sm transition active:scale-95 active:bg-indigo-600/60"
                    >
                      →
                    </button>
                  </div>
                )}

                {/* 飞机射击模式：触摸设备右下角发射键 */}
                {playMode === "plane_shooter" && gameState === "running" && isTouchDevice && (
                  <div className="absolute bottom-4 right-4 z-[20] select-none">
                    <button
                      type="button"
                      aria-label="发射"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        firePlaneBullet();
                      }}
                      className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-300/70 bg-amber-500/30 text-4xl text-amber-100 shadow-lg backdrop-blur-sm transition active:scale-95 active:bg-amber-500/60"
                    >
                      ↑
                    </button>
                  </div>
                )}

                {/* 拼单词模式：底部输入显示区 */}
                {playMode === "spell_word" && gameState === "running" && (
                  <div className="absolute bottom-0 left-0 right-0 z-[10] flex flex-col items-center gap-2 border-t border-indigo-300/20 bg-slate-950/90 px-4 py-3 backdrop-blur-sm">
                    {currentSpellTarget?.spellChallengeMode === "missing_letters" && (
                      <p className="text-xs text-emerald-200/80">
                        按顺序输入完整单词，已显示字母会跳一下作为反馈
                      </p>
                    )}
                    <div className="flex items-center gap-1.5">
                      {currentSpellTarget?.spellChallengeMode === "missing_letters" ? (
                        <span className="flex items-center gap-1">
                          {Array.from(currentSpellTarget.en.toLowerCase()).map((ch, idx) => {
                            const missingPosition = currentSpellTarget.missingLetterIndexes.indexOf(idx);
                            const isMissing = missingPosition >= 0;
                            const inputPosition = /^[a-zA-Z]$/.test(ch)
                              ? Array.from(currentSpellTarget.en.slice(0, idx))
                                  .filter((letter) => /^[a-zA-Z]$/.test(letter)).length
                              : -1;
                            if (ch === " ") {
                              return (
                                <span
                                  key={idx}
                                  className="mx-1 inline-flex h-9 items-center justify-center text-indigo-300/50"
                                  aria-label="space"
                                >
                                  /
                                </span>
                              );
                            }
                            const pulsing = spellPulseIndex === idx;
                            return (
                              <span
                                key={idx}
                                className={`inline-flex h-9 w-8 items-center justify-center rounded-lg border-2 text-lg font-bold shadow ${
                                  isMissing
                                    ? "border-emerald-400/70 bg-emerald-950/70 text-white"
                                    : "border-amber-300/45 bg-amber-950/60 text-amber-100"
                                } ${pulsing ? "spell-letter-pop" : ""}`}
                              >
                                {isMissing ? spellInput[inputPosition] || "_" : ch}
                              </span>
                            );
                          })}
                        </span>
                      ) : spellInput.length === 0 ? (
                        <span className="text-sm text-indigo-300/50">
                          在键盘上输入字母...
                        </span>
                      ) : (
                        spellInput.map((ch, i) =>
                          ch === " " ? (
                            <span
                              key={i}
                              className="inline-flex h-9 w-5 items-center justify-center text-indigo-300/50"
                              aria-label="space"
                            >
                              ␣
                            </span>
                          ) : (
                            <span
                              key={i}
                              className="inline-flex h-9 w-8 items-center justify-center rounded-lg border-2 border-indigo-400/60 bg-indigo-950/80 text-lg font-bold text-white shadow"
                            >
                              {ch}
                            </span>
                          )
                        )
                      )}
                      {currentSpellTarget?.spellChallengeMode !== "missing_letters" && (
                        <span className="inline-flex h-9 w-8 items-center justify-center rounded-lg border-2 border-dashed border-indigo-400/30 text-indigo-400/40">
                          _
                        </span>
                      )}
                      {spellTargetId && (
                        <button
                          type="button"
                          onClick={skipSpell}
                          className="ml-3 rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100/90 transition hover:bg-rose-500/30 hover:text-white"
                          title="跳过当前单词（记为失败）"
                        >
                          跳过 ⏭
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-indigo-300/60">
                      <span>Backspace 删除</span>
                      <span>Enter 确认</span>
                      {currentSpellTarget?.spellChallengeMode === "missing_letters" ? (
                        <span>按完整顺序输入字母，空格会直接显示在单词里</span>
                      ) : (
                        <span>词组用空格分隔</span>
                      )}
                      <span>点击"跳过"放弃当前单词</span>
                    </div>
                    {isTouchDevice && currentSpellTarget && touchSpellCandidates.length > 0 && (
                      <div className="mt-1 flex max-w-full flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSpellInput((prev) => prev.slice(0, -1))}
                          disabled={!spellInput.length}
                          className="rounded-xl border border-indigo-300/35 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-100 transition hover:bg-indigo-400/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmSpell()}
                          disabled={!spellInput.length}
                          className="rounded-xl border border-emerald-300/45 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-50 transition hover:bg-emerald-400/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          确认
                        </button>
                        {touchSpellCandidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => inputSpellCharacter(candidate.label)}
                            disabled={candidate.disabled}
                            className={`min-w-10 rounded-xl border px-3 py-2 text-base font-black uppercase shadow transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${
                              currentSpellTarget.spellChallengeMode === "missing_letters"
                                ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-400/25"
                                : "border-amber-300/40 bg-amber-500/15 text-amber-50 hover:bg-amber-400/25"
                            }`}
                            title={candidate.label === " " ? "空格" : `输入 ${candidate.label}`}
                          >
                            {candidate.label === " " ? "空格" : candidate.label}
                          </button>
                        ))}
                        {currentSpellTarget.spellChallengeMode === "missing_letters" && (
                          <button
                            type="button"
                            onClick={() => {
                              const answer = getSpellChallengeAnswer(currentSpellTarget);
                              const next = answer[spellInput.length];
                              if (!next) return;
                              setSpellPulseIndex(getLetterIndexByTypedPosition(currentSpellTarget.en, spellInput.length));
                              window.setTimeout(() => setSpellPulseIndex(null), 700);
                            }}
                            className="rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-400/20 active:scale-95"
                          >
                            提示
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {gameState !== "running" ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/55 p-4 text-center">
                    <div className="max-w-xl rounded-2xl border border-indigo-200/35 bg-slate-950/95 p-6">
                      <h1 className="text-3xl font-extrabold">
                        {gameState === "ended" ? "游戏结束" : "FlyWord 飞词"}
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
                              <p className="mt-2 text-indigo-100">
                                {spellChallengeMode === "missing_letters"
                                  ? "单词按正常顺序出现，但约一半字母会缺失。"
                                  : "单词从上方掉落，字母顺序被打乱。"}
                              </p>
                              <p className="mt-1 text-indigo-100">
                                {spellChallengeMode === "missing_letters"
                                  ? "在键盘上输入缺失的字母，按 Enter 确认。"
                                  : "在键盘上拼出正确的英文单词，按 Enter 确认。"}
                              </p>
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
      {<LlmChat engine={llmEngine} modelId={llmModelId} open={llmChatOpen} onClose={() => setLlmChatOpen(false)} selectedVoiceURI={selectedVoiceURI} ttsVoices={ttsVoices} />}

      {/* 登录 / 注册 — 暂时隐藏，需要时取消注释
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => setAuthUser(u)}
      />
      */}
    </main>
  );
}
