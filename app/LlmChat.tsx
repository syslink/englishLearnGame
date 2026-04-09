"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatMessage = { role: "user" | "assistant"; content: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LlmChat({ engine, modelId, open, onClose }: { engine: any; modelId: string; open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    if (!engine || streaming || !input.trim()) return;
    const userMsg = input.trim();
    setInput("");
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

      let text = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        text += delta;
        const captured = text;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: captured };
          return updated;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, { role: "assistant", content: `错误: ${err}` }]);
    } finally {
      setStreaming(false);
    }
  }, [engine, streaming, input, messages]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="flex h-[520px] w-[420px] flex-col rounded-2xl border border-indigo-300/30 bg-slate-950/95 shadow-2xl backdrop-blur-md">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-indigo-300/25 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-indigo-100">AI 助手</p>
          <p className="text-[10px] text-indigo-300/70">{modelId.split("-MLC")[0]}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMessages([])}
            className="rounded px-2 py-0.5 text-[10px] text-indigo-300/80 transition hover:bg-indigo-400/20 hover:text-indigo-100"
            title="清空对话"
          >
            清空
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-sm text-indigo-300/80 transition hover:bg-indigo-400/20 hover:text-indigo-100"
          >
            &times;
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-xs text-indigo-300/50">
            试试问我英语学习相关的问题吧！
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
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-indigo-300/25 px-3 py-2">
        <div className="flex items-center gap-2">
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
            placeholder="输入消息..."
            disabled={streaming}
            className="flex-1 rounded-lg border border-indigo-300/30 bg-slate-900/90 px-3 py-1.5 text-sm text-white placeholder-indigo-300/40 outline-none focus:border-indigo-400/60 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
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
