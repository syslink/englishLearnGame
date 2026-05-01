export type ScenarioItem = {
  id: number;
  scene: string;
  words: { word: string; meaning: string }[];
};

export type WordItem = {
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
  missingLetterIndexes: number[];
  spellChallengeMode: SpellChallengeMode;
  spellUnlocked: boolean;
};

export type LikeBurst = {
  id: string;
  left: number;
  top: number;
  size: number;
};

export type MistakeRecord = {
  key: string;
  en: string;
  zh: string;
  count: number;
};

export type StudyHistoryRecord = {
  key: string;
  en: string;
  zh: string;
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  lastStudiedAt: number;
};

export type StudyBatchRecord = {
  id: string;
  words: string[];
  wordCount: number;
  playCount: number;
  correctCount: number;
  wrongCount: number;
  createdAt: number;
  lastPlayedAt: number;
};

export type GameState = "idle" | "running" | "ended";
export type PlayMode = "voice_match" | "plane_shooter" | "spell_word";
export type SpellChallengeMode = "shuffle" | "missing_letters";
export type GameSpeechEngine = "browser" | "openai" | "aliyun";
export type OpenAiTtsVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "fable"
  | "nova"
  | "onyx"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

export type Bullet = {
  id: string;
  x: number;
  y: number;
  speed: number;
  targetId: string;
};

export type LexiconItem = { en: string; zh: string };

export type RobotChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CloudProviderId = "openai" | "deepseek" | "aliyun";
export type VoiceProviderId = "openai" | "minimax" | "aliyun";
export type SpeechRecognitionProviderId = "openai" | "aliyun";
export type AiRegionMode = "global" | "china" | "manual";

export type CloudProviderConfig = {
  id: CloudProviderId;
  label: string;
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
};

export type VoiceProviderConfig = {
  id: VoiceProviderId;
  label: string;
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
  defaultVoice: string;
};

export type SpeechRecognitionProviderConfig = {
  id: SpeechRecognitionProviderId;
  label: string;
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
};
