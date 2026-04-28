"use client";

import type { RefObject } from "react";
import type {
  GameState,
  LexiconItem,
  MistakeRecord,
  PlayMode,
  ScenarioItem,
  CloudProviderConfig,
  CloudProviderId,
  GameSpeechEngine,
  OpenAiTtsVoice,
  SpellChallengeMode,
  StudyBatchRecord,
} from "./types";

type LlmStatus = "idle" | "loading" | "ready" | "error";
type LlmModelOption = { id: string; size: string; cached?: boolean };

export function BrowserWarning({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky top-0 z-[100] flex items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-500/15 px-3 py-2 backdrop-blur-md sm:px-4 sm:py-2.5">
      <div className="flex items-start gap-2 text-xs text-amber-100 sm:items-center sm:text-sm">
        <span className="text-base sm:text-lg">⚠️</span>
        <span>
          为获得最佳体验（语音识别、本地大模型），建议使用
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            rel="noopener noreferrer"
            className="mx-1 font-semibold underline decoration-amber-300 underline-offset-2 hover:text-white"
          >
            Google Chrome
          </a>
          浏览器访问本页面。
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded px-2 py-0.5 text-sm text-amber-100/80 transition hover:bg-amber-400/20 hover:text-white"
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  );
}

export function AppHeader({
  llmStatus,
  onOpenChat,
}: {
  llmStatus: LlmStatus;
  onOpenChat: () => void;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="flex items-baseline gap-2">
          <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-indigo-300 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl md:text-5xl">
            FlyWord
          </span>
          <span className="text-xl font-extrabold text-indigo-100 sm:text-2xl md:text-3xl">飞词</span>
        </h1>
        <p className="mt-1 text-xs text-indigo-200/80 sm:text-sm">
          开口就记住 · AI 生词 · 语音识别 · 像打飞机一样击落每个单词
        </p>
      </div>
      {/* <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
          llmStatus === "ready"
            ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
            : llmStatus === "loading"
              ? "border border-amber-400/40 bg-amber-500/10 text-amber-200"
              : llmStatus === "error"
                ? "border border-rose-400/40 bg-rose-500/10 text-rose-200"
                : "border border-indigo-400/30 bg-indigo-500/10 text-indigo-200/80"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            llmStatus === "ready" ? "bg-emerald-400 animate-pulse"
            : llmStatus === "loading" ? "bg-amber-400 animate-pulse"
            : llmStatus === "error" ? "bg-rose-400"
            : "bg-indigo-400/60"
          }`} />
          本地AI {llmStatus === "ready" ? "就绪" : llmStatus === "loading" ? "加载中" : llmStatus === "error" ? "未就绪" : "未加载"}
        </span>
        {llmStatus === "ready" && (
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/25"
          >
            💬 跟 AI 对话
          </button>
        )}
      </div> */}
    </header>
  );
}

export function ModeSelector({
  playMode,
  gameState,
  onModeChange,
}: {
  playMode: PlayMode;
  gameState: GameState;
  onModeChange: (mode: PlayMode) => void;
}) {
  return (
    <section className="mb-5 sm:mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-indigo-200/90">选择游戏模式</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { id: "voice_match" as PlayMode, icon: "🎯", name: "释义匹配", desc: "看中文说英文" },
          { id: "plane_shooter" as PlayMode, icon: "✈️", name: "飞机射击", desc: "语音锁定+射击" },
          { id: "spell_word" as PlayMode, icon: "⌨️", name: "拼单词", desc: "键盘拼出单词" },
        ].map((mode) => {
          const active = playMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onModeChange(mode.id)}
              disabled={gameState === "running"}
              className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? "border-emerald-400/60 bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-indigo-500/15 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]"
                  : "border-indigo-300/20 bg-slate-900/60 hover:border-indigo-300/40 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl">{mode.icon}</span>
                {active && (
                  <span className="rounded-full bg-emerald-400/90 px-2 py-0.5 text-[10px] font-bold text-slate-900">当前</span>
                )}
              </div>
              <p className="mt-2 text-base font-bold text-white">{mode.name}</p>
              <p className="text-xs text-indigo-200/70">{mode.desc}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function LexiconAndStartPanel({
  scenarios,
  gameState,
  playMode,
  wordInput,
  lexiconLabels,
  llmStatus,
  aiGenerationAvailable,
  aiGenerationLabel,
  llmTopic,
  llmGenerating,
  lexiconNormalizing,
  openAiSpeechVoice,
  openAiSpeechVoices,
  openAiSpeechSpeed,
  explainingWordKey,
  timeBoost,
  roundSeconds,
  planeDropChineseOnly,
  gameSpeechEngine,
  spellChallengeMode,
  onWordInputChange,
  onLoadScenario,
  onLlmTopicChange,
  onGenerateWordsWithLlm,
  onNormalizeLexiconWithAi,
  onOpenAiSpeechVoiceChange,
  onOpenAiSpeechSpeedChange,
  onSpeakText,
  onExplainWord,
  onStart,
  onStop,
  onUseTimeBoost,
  onRoundSecondsChange,
  onPlaneDropChineseOnlyChange,
  onGameSpeechEngineChange,
  onSpellChallengeModeChange,
}: {
  scenarios: ScenarioItem[];
  gameState: GameState;
  playMode: PlayMode;
  wordInput: string;
  lexiconLabels: LexiconItem[];
  llmStatus: LlmStatus;
  aiGenerationAvailable: boolean;
  aiGenerationLabel: string;
  llmTopic: string;
  llmGenerating: boolean;
  lexiconNormalizing: boolean;
  openAiSpeechVoice: OpenAiTtsVoice;
  openAiSpeechVoices: readonly OpenAiTtsVoice[];
  openAiSpeechSpeed: number;
  explainingWordKey: string | null;
  timeBoost: number;
  roundSeconds: string;
  planeDropChineseOnly: boolean;
  gameSpeechEngine: GameSpeechEngine;
  spellChallengeMode: SpellChallengeMode;
  onWordInputChange: (value: string) => void;
  onLoadScenario: (scenarioId: number) => void;
  onLlmTopicChange: (value: string) => void;
  onGenerateWordsWithLlm: () => void;
  onNormalizeLexiconWithAi: () => void;
  onOpenAiSpeechVoiceChange: (voice: OpenAiTtsVoice) => void;
  onOpenAiSpeechSpeedChange: (speed: number) => void;
  onSpeakText: (text: string) => void;
  onExplainWord: (item: LexiconItem) => void;
  onStart: () => void;
  onStop: () => void;
  onUseTimeBoost: () => void;
  onRoundSecondsChange: (seconds: string) => void;
  onPlaneDropChineseOnlyChange: (enabled: boolean) => void;
  onGameSpeechEngineChange: (engine: GameSpeechEngine) => void;
  onSpellChallengeModeChange: (mode: SpellChallengeMode) => void;
}) {
  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="rounded-2xl border border-indigo-300/25 bg-slate-950/60 p-5 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-indigo-200/90">
            📚 词库
          </h2>
          <select
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) onLoadScenario(id);
              e.target.value = "";
            }}
            disabled={gameState === "running"}
            defaultValue=""
            className="max-w-[200px] rounded-lg border border-indigo-300/30 bg-slate-900/80 px-2 py-1 text-xs text-white outline-none disabled:opacity-60"
          >
            <option value="" disabled>
              📥 导入场景词库…
            </option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.scene}（{s.words.length}词）
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={wordInput}
          onChange={(e) => onWordInputChange(e.target.value)}
          spellCheck={false}
          placeholder="每行一条，格式：英文=中文&#10;例如：&#10;apple=苹果&#10;look after=照顾"
          className="h-48 w-full resize-y rounded-xl border border-indigo-300/25 bg-slate-950/80 p-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400/70"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-2">
          <p className="text-[11px] text-cyan-100/70">
            粘贴任意格式的单词列表后，可让 AI 智能整理为“英文=中文”。
          </p>
          <button
            type="button"
            onClick={onNormalizeLexiconWithAi}
            disabled={!aiGenerationAvailable || lexiconNormalizing || !wordInput.trim() || gameState === "running"}
            className="rounded-lg border border-cyan-300/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {lexiconNormalizing ? "识别中..." : "智能识别格式"}
          </button>
        </div>

        {aiGenerationAvailable && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/5 p-2">
            <span className="text-lg">✨</span>
            <input
              type="text"
              placeholder="输入主题让 AI 生成词库：旅行、面试、医院…"
              value={llmTopic}
              onChange={(e) => onLlmTopicChange(e.target.value)}
              className="flex-1 rounded-lg border border-emerald-300/20 bg-slate-950/60 px-2 py-1 text-xs text-white placeholder-emerald-200/40 outline-none focus:border-emerald-400/60"
            />
            <button
              type="button"
              onClick={onGenerateWordsWithLlm}
              disabled={llmGenerating}
              className="shrink-0 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {llmGenerating ? "生成中..." : aiGenerationLabel}
            </button>
          </div>
        )}

        {lexiconLabels.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-indigo-200/70">共 {lexiconLabels.length} 词 · 点击用 OpenAI 发音</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-indigo-200/70">
                  <span>OpenAI 语速</span>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={openAiSpeechSpeed}
                    onChange={(e) => onOpenAiSpeechSpeedChange(Number(e.target.value))}
                    className="h-1.5 w-24 accent-emerald-400"
                  />
                  <span className="w-8 text-right text-emerald-200">{openAiSpeechSpeed.toFixed(1)}x</span>
                </label>
                <select
                  value={openAiSpeechVoice}
                  onChange={(e) => onOpenAiSpeechVoiceChange(e.target.value as OpenAiTtsVoice)}
                  className="max-w-[180px] rounded-md border border-indigo-300/25 bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white outline-none"
                  title="OpenAI 内置发音人"
                >
                  {openAiSpeechVoices.map((voice) => (
                    <option key={voice} value={voice}>
                      {voice}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {lexiconLabels.map((item, idx) => (
                <span
                  key={`${item.en}-${item.zh}-${idx}`}
                  className="inline-flex overflow-hidden rounded-full border border-cyan-300/30 bg-cyan-500/10 text-[11px] text-cyan-100"
                >
                  <button
                    type="button"
                    onClick={() => onSpeakText(item.en)}
                    className="px-2 py-0.5 transition hover:bg-cyan-400/25"
                    title={`点击发音：${item.en}`}
                  >
                    {item.en}
                  </button>
                  <button
                    type="button"
                    onClick={() => onExplainWord(item)}
                    disabled={Boolean(explainingWordKey)}
                    className="border-l border-cyan-300/25 px-1.5 py-0.5 text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50"
                    title={`获取适合小学生的单词讲解：${item.en}`}
                  >
                    {explainingWordKey === `${item.en}|${item.zh}` ? "讲解中" : "讲解"}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-slate-950/60 p-5 backdrop-blur-md">
        <div className="flex-1">
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-emerald-200/90">🚀 开始挑战</h2>
          <p className="text-xs text-indigo-200/70">
            当前模式：
            <span className="ml-1 font-semibold text-emerald-200">
              {playMode === "voice_match" ? "释义匹配" : playMode === "spell_word" ? "拼单词" : "飞机射击"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-indigo-200/70">
            词条数量：<span className="font-semibold text-emerald-200">{lexiconLabels.length}</span>
            {lexiconLabels.length < 3 && (
              <span className="ml-2 text-rose-300">（至少需要 3 条）</span>
            )}
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs text-indigo-200/80" htmlFor="gameDurationSeconds">
            <span>游戏时长</span>
            <input
              id="gameDurationSeconds"
              type="number"
              value={roundSeconds}
              onChange={(e) => onRoundSecondsChange(e.target.value)}
              disabled={gameState === "running"}
              className="w-20 rounded-md border border-emerald-300/30 bg-slate-900/80 px-2 py-1 text-center text-xs text-white outline-none focus:border-emerald-400 disabled:opacity-60"
            />
            <span>秒</span>
          </label>
          {playMode === "voice_match" && (
            <label className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-300/20 bg-slate-900/50 px-3 py-1.5 text-xs text-indigo-100/90">
              <input
                type="checkbox"
                checked={planeDropChineseOnly}
                onChange={(e) => onPlaneDropChineseOnlyChange(e.target.checked)}
                disabled={gameState === "running"}
                className="h-4 w-4 rounded border-indigo-300/40 bg-slate-900/90 accent-emerald-400 disabled:opacity-50"
              />
              <span>中文下落模式：下落词条显示中文，仍需说出对应英文</span>
            </label>
          )}
          {(playMode === "voice_match" || playMode === "plane_shooter") && (
            <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-3">
              <p className="mb-2 text-xs font-semibold text-cyan-100/90">语音识别方式</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "browser" as GameSpeechEngine,
                    title: "浏览器内置",
                    desc: "响应快，适合 Chrome 环境",
                  },
                  {
                    id: "openai" as GameSpeechEngine,
                    title: "OpenAI 识别",
                    desc: "转写后匹配近音候选，提高命中率",
                  },
                ].map((engine) => (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => onGameSpeechEngineChange(engine.id)}
                    disabled={gameState === "running"}
                    className={`rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      gameSpeechEngine === engine.id
                        ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-50"
                        : "border-indigo-300/20 bg-slate-900/50 text-indigo-100/80 hover:bg-slate-900/80"
                    }`}
                  >
                    <p className="text-xs font-bold">{engine.title}</p>
                    <p className="mt-0.5 text-[10px] text-indigo-100/60">{engine.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {playMode === "spell_word" && (
            <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/5 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-100/90">拼写挑战方式</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "shuffle" as SpellChallengeMode,
                    title: "乱序拼写",
                    desc: "字母全部打乱，输入完整单词",
                  },
                  {
                    id: "missing_letters" as SpellChallengeMode,
                    title: "缺字母填空",
                    desc: "保留顺序，补全约 50% 缺失字母",
                  },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onSpellChallengeModeChange(mode.id)}
                    disabled={gameState === "running"}
                    className={`rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      spellChallengeMode === mode.id
                        ? "border-amber-300/60 bg-amber-400/15 text-amber-50"
                        : "border-indigo-300/20 bg-slate-900/50 text-indigo-100/80 hover:bg-slate-900/80"
                    }`}
                  >
                    <p className="text-xs font-bold">{mode.title}</p>
                    <p className="mt-0.5 text-[10px] text-indigo-100/60">{mode.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 space-y-1.5 text-[11px] text-indigo-200/80">
            {playMode === "voice_match" && (
              <>
                <p>· 看中文，直接说出对应英文</p>
                <p>· 语音自动识别，匹配成功进入下一题</p>
              </>
            )}
            {playMode === "plane_shooter" && (
              <>
                <p>· 按住空格说英文锁定红色目标</p>
                <p>· 左右方向键移动，上键发射子弹</p>
              </>
            )}
            {playMode === "spell_word" && (
              <>
                <p>· 可选择乱序拼写，或按顺序补全缺失字母</p>
                <p>· 键盘输入字母，回车确认</p>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={gameState === "running" || lexiconLabels.length < 3}
          className="mt-4 w-full rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-3 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          开始游戏 ▶
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onStop}
            disabled={gameState !== "running"}
            className="rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            提前结束
          </button>
          {playMode === "voice_match" ? (
            <button
              type="button"
              onClick={onUseTimeBoost}
              disabled={gameState !== "running" || timeBoost <= 0}
              className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              加时 +1s（{timeBoost}）
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>
    </section>
  );
}

export function ReviewPanels({
  mistakeList,
  studyBatchList,
  gameState,
  onLoadMistakePractice,
  onClearMistakes,
  onLoadBatchPractice,
  onClearBatches,
  onSpeakText,
}: {
  mistakeList: MistakeRecord[];
  studyBatchList: StudyBatchRecord[];
  gameState: GameState;
  onLoadMistakePractice: () => void;
  onClearMistakes: () => void;
  onLoadBatchPractice: (batchId: string) => void;
  onClearBatches: () => void;
  onSpeakText: (text: string) => void;
}) {
  return (
    <section className="mb-6 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-rose-300/25 bg-slate-950/60 p-4 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-rose-100/90">
            <span>🔥</span>
            <span>高频错词</span>
            {mistakeList.length > 0 && (
              <span className="rounded-full bg-rose-500/25 px-1.5 text-[10px] font-bold text-rose-100">
                {mistakeList.length}
              </span>
            )}
          </h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onLoadMistakePractice}
              disabled={!mistakeList.length || gameState === "running"}
              className="rounded-md border border-rose-300/30 px-2 py-0.5 text-[11px] text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              载入练习
            </button>
            <button
              type="button"
              onClick={onClearMistakes}
              disabled={!mistakeList.length}
              className="rounded-md border border-rose-300/30 px-2 py-0.5 text-[11px] text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              清空
            </button>
          </div>
        </div>
        <div className="max-h-28 overflow-y-auto pr-1">
          {mistakeList.length ? (
            <div className="flex flex-wrap gap-1.5">
              {mistakeList.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onSpeakText(m.en)}
                  className="rounded-full border border-rose-300/35 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-100 transition hover:bg-rose-400/25"
                  title={`${m.en}（错误 ${m.count} 次）`}
                >
                  {m.en} ×{m.count}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-rose-100/60">还没有错词记录，开始游戏后会自动累计。</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/60 p-4 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-cyan-100/90">
            <span>📅</span>
            <span>批次复习</span>
            {studyBatchList.length > 0 && (
              <span className="rounded-full bg-cyan-500/25 px-1.5 text-[10px] font-bold text-cyan-100">
                {studyBatchList.length}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={onClearBatches}
            disabled={!studyBatchList.length}
            className="rounded-md border border-cyan-300/30 px-2 py-0.5 text-[11px] text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            清空
          </button>
        </div>
        <div className="max-h-28 overflow-y-auto pr-1">
          {studyBatchList.length ? (
            <div className="flex flex-wrap gap-1.5">
              {studyBatchList.slice(0, 40).map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => onLoadBatchPractice(batch.id)}
                  disabled={gameState === "running"}
                  className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                  title={`词数${batch.wordCount} 练习${batch.playCount}次 ✓${batch.correctCount} ✗${batch.wrongCount}\n${batch.words.join("\n")}`}
                >
                  {new Date(batch.lastPlayedAt).toLocaleDateString("zh-CN")} · {batch.wordCount}词 · 第{batch.playCount}次
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-cyan-100/60">暂无批次记录，开始游戏后会按词库自动记录。</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function LlmSettingsPanel({
  dropdownRef,
  llmDropdownOpen,
  llmModelFilter,
  llmModelId,
  llmStatus,
  llmProgress,
  llmAvailableModels,
  filteredLlmModels,
  selectedModelCached,
  cloudProviders,
  cloudProviderId,
  onDropdownOpenChange,
  onModelFilterChange,
  onModelChange,
  onLoadModel,
  onCloudProviderChange,
}: {
  dropdownRef: RefObject<HTMLDivElement | null>;
  llmDropdownOpen: boolean;
  llmModelFilter: string;
  llmModelId: string;
  llmStatus: LlmStatus;
  llmProgress: string;
  llmAvailableModels: LlmModelOption[];
  filteredLlmModels: LlmModelOption[];
  selectedModelCached?: boolean;
  cloudProviders: CloudProviderConfig[];
  cloudProviderId: CloudProviderId;
  onDropdownOpenChange: (open: boolean) => void;
  onModelFilterChange: (filter: string) => void;
  onModelChange: (modelId: string) => void;
  onLoadModel: () => void;
  onCloudProviderChange: (providerId: CloudProviderId) => void;
}) {
  const selectedCloudProvider =
    cloudProviders.find((provider) => provider.id === cloudProviderId) || cloudProviders[0];

  return (
    <section className="space-y-3">
      <details className="group rounded-2xl border border-sky-300/15 bg-slate-950/40 p-4 backdrop-blur-md">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-sky-200/90">
          <span className="flex items-center gap-2">
            <span>☁️</span>
            <span>云端大模型设置</span>
            <span className="text-[10px] font-normal text-sky-300/60">OpenAI · DeepSeek</span>
          </span>
          <span className="text-sky-300/60 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
          <label className="block">
            <span className="mb-1 block text-sky-100/75">供应商</span>
            <select
              value={cloudProviderId}
              onChange={(e) => onCloudProviderChange(e.target.value as CloudProviderId)}
              className="w-full rounded-lg border border-sky-300/30 bg-slate-900/80 px-2 py-1.5 text-sm text-white outline-none focus:border-sky-300"
            >
              {cloudProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <span className={`inline-flex w-fit shrink-0 rounded-full border px-2 py-1 text-[11px] ${
            selectedCloudProvider?.configured
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
              : "border-amber-400/40 bg-amber-500/10 text-amber-200"
          }`}>
            {selectedCloudProvider?.configured ? "可用" : "未配置"}
          </span>
        </div>
      </details>

      <details className="group rounded-2xl border border-indigo-300/15 bg-slate-950/40 p-4 backdrop-blur-md">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-indigo-200/90">
          <span className="flex items-center gap-2">
            <span>⚙️</span>
            <span>本地大模型设置</span>
            <span className="text-[10px] font-normal text-indigo-300/60">WebLLM · 需 WebGPU</span>
          </span>
          <span className="text-indigo-300/60 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div ref={dropdownRef} className="relative w-full sm:w-auto">
            <input
              type="text"
              value={llmDropdownOpen ? llmModelFilter : (llmModelId || "加载模型列表中...")}
              onChange={(e) => {
                onModelFilterChange(e.target.value);
                onDropdownOpenChange(true);
              }}
              onFocus={() => {
                onDropdownOpenChange(true);
                onModelFilterChange("");
              }}
              disabled={llmStatus === "loading" || !llmAvailableModels.length}
              placeholder="搜索模型..."
              className="w-full rounded-lg border border-indigo-300/30 bg-slate-900/80 px-2 py-1 text-sm text-white placeholder-indigo-300/40 outline-none disabled:opacity-60 sm:w-[280px]"
            />
            {llmDropdownOpen && llmAvailableModels.length > 0 && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-indigo-300/30 bg-slate-900/95 py-1 shadow-xl sm:w-[360px]">
                {filteredLlmModels.length ? (
                  filteredLlmModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onModelChange(m.id);
                        onDropdownOpenChange(false);
                        onModelFilterChange("");
                      }}
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
            onClick={onLoadModel}
            disabled={llmStatus === "loading" || !llmModelId}
            className="rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {llmStatus === "loading" ? "加载中..." : (llmStatus === "ready" || selectedModelCached) ? "重新加载" : "加载模型"}
          </button>
          {llmStatus === "ready" && (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">已就绪</span>
          )}
          {llmStatus === "error" && (
            <span className="rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">加载失败</span>
          )}
        </div>
        {llmStatus === "loading" && llmProgress && (
          <p className="mt-2 font-mono text-xs text-amber-200/80">{llmProgress}</p>
        )}
      </details>
    </section>
  );
}
