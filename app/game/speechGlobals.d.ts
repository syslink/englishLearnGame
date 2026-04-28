import type { SpeechRecognitionLike } from "./speechTypes";

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

export {};

