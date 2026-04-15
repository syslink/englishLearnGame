"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatMessage = { role: "user" | "assistant"; content: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LlmChat({
  engine,
  modelId,
  open,
  onClose,
  selectedVoiceURI,
  ttsVoices,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: any;
  modelId: string;
  open: boolean;
  onClose: () => void;
  selectedVoiceURI: string;
  ttsVoices: SpeechSynthesisVoice[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef = useRef<any>(null);
  const ttsTimerRef = useRef<number | null>(null);
  const shouldAutoListenRef = useRef(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopListening();
      cancelTts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      cancelTts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelTts = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (ttsTimerRef.current) {
      window.clearTimeout(ttsTimerRef.current);
      ttsTimerRef.current = null;
    }
  }, []);

  const speakText = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }
        const synth = window.speechSynthesis;

        const speakNow = () => {
          const utter = new SpeechSynthesisUtterance(text.trim());
          const voice = ttsVoices.find((v) => v.voiceURI === selectedVoiceURI);
          if (voice) {
            utter.voice = voice;
            utter.lang = voice.lang || "en-US";
          } else {
            utter.lang = "en-US";
          }
          utter.rate = 0.9;
          utter.pitch = 1;
          utter.volume = 1;
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          synth.speak(utter);
        };

        if (ttsTimerRef.current) {
          window.clearTimeout(ttsTimerRef.current);
          ttsTimerRef.current = null;
        }

        if (synth.speaking || synth.pending) {
          synth.cancel();
          ttsTimerRef.current = window.setTimeout(() => {
            synth.resume();
            speakNow();
          }, 120) as unknown as number;
        } else {
          synth.resume();
          speakNow();
        }
      });
    },
    [selectedVoiceURI, ttsVoices],
  );

  const stopListening = useCallback(() => {
    if (speechRef.current) {
      speechRef.current.onend = null;
      speechRef.current.onresult = null;
      speechRef.current.onerror = null;
      speechRef.current.stop();
      speechRef.current = null;
    }
    setListening(false);
    setInterimText("");
  }, []);

  const send = useCallback(
    async (text?: string) => {
      const userMsg = (text ?? input).trim();
      if (!engine || streaming || !userMsg) return;
      setInput("");
      setInterimText("");
      const next = [...messages, { role: "user" as const, content: userMsg }];
      setMessages(next);
      setStreaming(true);

      try {
        const stream = await engine.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are a helpful English learning assistant. You can help users learn English vocabulary, grammar, and pronunciation. Answer in the language the user uses. Keep responses concise.",
            },
            ...next,
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 500,
        });

        let fullText = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content || "";
          fullText += delta;
          const captured = fullText;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: captured };
            return updated;
          });
        }

        // Voice mode: speak the response, then auto-listen
        if (voiceMode && fullText) {
          await speakText(fullText);
          // Auto-start listening after TTS finishes
          if (shouldAutoListenRef.current) {
            // Small delay to avoid capturing TTS echo
            setTimeout(() => {
              if (shouldAutoListenRef.current && !streamingRef.current) {
                startListening();
              }
            }, 300);
          }
        }
      } catch (err) {
        console.error("Chat error:", err);
        setMessages((prev) => [...prev, { role: "assistant", content: `错误: ${err}` }]);
      } finally {
        setStreaming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, streaming, input, messages, voiceMode, speakText],
  );

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    stopListening();

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: { results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }> }) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript || "";
        if (result?.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setInterimText("");
        send(final);
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setInterimText("");
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText("");
    };

    speechRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [stopListening, send]);

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      // Turn off voice mode
      setVoiceMode(false);
      shouldAutoListenRef.current = false;
      stopListening();
      cancelTts();
    } else {
      // Turn on voice mode and start listening
      setVoiceMode(true);
      shouldAutoListenRef.current = true;
      startListening();
    }
  }, [voiceMode, stopListening, cancelTts, startListening]);

  const toggleMic = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, stopListening, startListening]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex h-full max-h-[600px] w-full max-w-[440px] flex-col rounded-2xl border border-indigo-300/30 bg-slate-950/95 shadow-2xl backdrop-blur-md">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-indigo-300/25 px-4 py-2.5">
          <div>
            <p className="text-sm font-semibold text-indigo-100">AI 语音助手</p>
            <p className="text-[10px] text-indigo-300/70">{modelId.split("-MLC")[0]}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 语音模式切换 */}
            <button
              type="button"
              onClick={toggleVoiceMode}
              className={`rounded px-2 py-0.5 text-[10px] transition ${
                voiceMode
                  ? "bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40"
                  : "text-indigo-300/80 hover:bg-indigo-400/20 hover:text-indigo-100"
              }`}
              title={voiceMode ? "关闭语音对话" : "开启语音对话"}
            >
              {voiceMode ? "🎙 语音对话中" : "🎙 语音对话"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                cancelTts();
              }}
              className="rounded px-2 py-0.5 text-[10px] text-indigo-300/80 transition hover:bg-indigo-400/20 hover:text-indigo-100"
              title="清空对话"
            >
              清空
            </button>
            <button
              type="button"
              onClick={() => {
                stopListening();
                cancelTts();
                onClose();
              }}
              className="rounded px-1.5 py-0.5 text-sm text-indigo-300/80 transition hover:bg-indigo-400/20 hover:text-indigo-100"
            >
              &times;
            </button>
          </div>
        </div>

        {/* 语音状态指示 */}
        {voiceMode && (
          <div className="flex items-center justify-center gap-2 border-b border-indigo-300/15 py-2">
            {streaming ? (
              <div className="flex items-center gap-2 text-xs text-amber-300">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                AI 思考中...
              </div>
            ) : listening ? (
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
                正在聆听... {interimText && <span className="text-white/60">「{interimText}」</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-indigo-300/60">
                <span className="inline-block h-2 w-2 rounded-full bg-indigo-400/40" />
                {window.speechSynthesis?.speaking ? "AI 正在说话..." : "等待中"}
              </div>
            )}
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
          {messages.length === 0 && (
            <p className="mt-8 text-center text-xs text-indigo-300/50">
              {voiceMode
                ? "语音对话已开启，请开始说话！"
                : "试试问我英语学习相关的问题吧！"}
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600/80 text-white"
                    : "bg-slate-800/90 text-indigo-100"
                }`}
              >
                {msg.content || (streaming && i === messages.length - 1 ? "..." : "")}
              </div>
              {/* 单条消息播放按钮 */}
              {msg.role === "assistant" && msg.content && (
                <button
                  type="button"
                  onClick={() => speakText(msg.content)}
                  className="ml-1 self-end rounded p-1 text-xs text-indigo-300/50 transition hover:text-indigo-200"
                  title="播放语音"
                >
                  🔊
                </button>
              )}
            </div>
          ))}
          {/* 实时语音识别文字 */}
          {interimText && !voiceMode && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-xl bg-indigo-600/40 px-3 py-2 text-sm italic text-white/60">
                {interimText}...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* 输入区 */}
        <div className="border-t border-indigo-300/25 px-3 py-2">
          <div className="flex items-center gap-2">
            {/* 麦克风按钮 */}
            <button
              type="button"
              onClick={toggleMic}
              disabled={streaming}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition ${
                listening
                  ? "bg-red-500/80 text-white animate-pulse hover:bg-red-500"
                  : "bg-slate-800 text-indigo-300/70 hover:bg-slate-700 hover:text-indigo-200"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              title={listening ? "停止录音" : "开始录音"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                <path d="M17 11a1 1 0 0 1 2 0 7 7 0 0 1-14 0 1 1 0 0 1 2 0 5 5 0 0 0 10 0z" />
                <path d="M11 19.93V22a1 1 0 0 0 2 0v-2.07A7.01 7.01 0 0 0 19 13a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7.01 7.01 0 0 0 6 6.93z" />
              </svg>
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={listening ? "正在聆听..." : "输入消息或点击麦克风说话..."}
              disabled={streaming}
              className="flex-1 rounded-lg border border-indigo-300/30 bg-slate-900/90 px-3 py-1.5 text-sm text-white placeholder-indigo-300/40 outline-none focus:border-indigo-400/60 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={streaming || !input.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {streaming ? "..." : "发送"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
