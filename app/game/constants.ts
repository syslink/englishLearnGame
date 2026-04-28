import categoriesData from "../categories.json";
import type { OpenAiTtsVoice, ScenarioItem } from "./types";

export const SCENARIOS: ScenarioItem[] = categoriesData.scenarios;

export const ROUND_MS = 30000;
export const STUDY_HISTORY_STORAGE_KEY = "english_voice_game_study_history_v1";
export const STUDY_BATCH_STORAGE_KEY = "english_voice_game_study_batch_v1";

export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const satisfies readonly OpenAiTtsVoice[];
