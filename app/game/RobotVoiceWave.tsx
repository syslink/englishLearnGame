"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import type { RobotChatMessage } from "./types";

const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

export default function RobotVoiceWave({
  active,
  word,
  progress,
  percent,
  speaking,
  asking,
  messages,
  onClose,
  onSeek,
  onAsk,
  onVoiceAsk,
}: {
  active: boolean;
  word: string;
  progress: string;
  percent: number;
  speaking: boolean;
  asking: boolean;
  messages: RobotChatMessage[];
  onClose: () => void;
  onSeek: (percent: number) => void;
  onAsk: (message: string) => void;
  onVoiceAsk: (audio: Blob) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  if (!active) return null;

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || asking) return;
    setInput("");
    onAsk(trimmed);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(input);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const startRecording = async () => {
    if (recording || voiceBusy || asking) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceHint("当前浏览器不支持录音");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setVoiceHint("当前浏览器不支持语音消息");
      return;
    }

    try {
      setVoiceHint("");
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setVoiceBusy(false);
        setRecording(false);
        setVoiceHint("录音失败，请重试");
        stopStream();
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recorderRef.current = null;
        chunksRef.current = [];
        stopStream();
        setRecording(false);

        if (blob.size < 800) {
          setVoiceHint("录音太短啦，再说一遍试试");
          setVoiceBusy(false);
          return;
        }

        setVoiceBusy(true);
        setVoiceHint("机器人正在识别你的语音...");
        onVoiceAsk(blob)
          .then(() => setVoiceHint(""))
          .catch((err) => {
            setVoiceHint((err as Error).message || "语音识别失败，请重试");
          })
          .finally(() => setVoiceBusy(false));
      };

      recorder.start();
      setRecording(true);
      setVoiceHint("正在录音，讲完后再点一次发送");
    } catch {
      stopStream();
      setRecording(false);
      setVoiceBusy(false);
      setVoiceHint("无法使用麦克风，请检查浏览器权限");
    }
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
      return;
    }
    void startRecording();
  };

  return (
    <div className="fixed bottom-5 left-1/2 z-[80] w-[min(94vw,460px)] -translate-x-1/2">
      <div className="overflow-hidden rounded-2xl border border-emerald-300/35 bg-slate-950/92 px-4 py-3 shadow-2xl shadow-emerald-500/20 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="robot-eye flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/45 bg-cyan-400/10 text-lg">
              🤖
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-100">机器人老师正在讲解</p>
              <p className="max-w-[260px] truncate text-[11px] text-cyan-100/70">
                {word} {progress ? `· ${progress}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              speaking
                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                : "border-indigo-300/30 bg-indigo-400/10 text-indigo-100"
            }`}>
              {speaking ? "ON AIR" : "已暂停"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-400/30 px-2 py-0.5 text-xs font-bold text-slate-200 transition hover:border-rose-300/60 hover:bg-rose-500/15 hover:text-rose-100"
              title="关闭并结束播报"
            >
              ×
            </button>
          </div>
        </div>
        <div className="robot-wave flex h-16 items-end justify-center gap-1.5 rounded-xl border border-cyan-300/15 bg-gradient-to-b from-cyan-500/10 to-emerald-500/5 px-3 py-3">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className={`block w-2 rounded-full bg-gradient-to-t from-emerald-300 to-cyan-200 ${
                speaking ? "robot-wave-bar" : "opacity-40"
              }`}
              style={{
                animationDelay: `${(i % 9) * 90}ms`,
                height: speaking ? `${18 + ((i * 17) % 34)}px` : `${12 + ((i * 11) % 18)}px`,
              }}
            />
          ))}
        </div>
        <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/60">
          播放进度
          <input
            type="range"
            min="0"
            max="100"
            step="0.5"
            value={Math.max(0, Math.min(100, percent))}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="mt-2 h-1.5 w-full accent-emerald-300"
          />
        </label>
        <div className="mt-3 max-h-32 space-y-2 overflow-y-auto rounded-xl border border-indigo-300/15 bg-slate-900/55 p-2">
          {messages.length ? (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-lg px-2 py-1.5 text-xs leading-relaxed ${
                  message.role === "user"
                    ? "ml-8 bg-indigo-500/25 text-indigo-50"
                    : "mr-8 bg-emerald-500/12 text-emerald-50"
                }`}
              >
                {message.content}
              </div>
            ))
          ) : (
            <p className="text-center text-[11px] text-indigo-200/55">
              可以问机器人：“再举个例子”“怎么拼更好记？”
            </p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["再讲简单点", "给我造个句子", "怎么记住拼写"].map((tip) => (
            <button
              key={tip}
              type="button"
              onClick={() => send(tip)}
              disabled={asking}
              className="rounded-full border border-cyan-300/25 px-2 py-0.5 text-[10px] text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-wait disabled:opacity-50"
            >
              {tip}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={asking || voiceBusy}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              recording
                ? "border-rose-300/60 bg-rose-500/25 text-rose-100"
                : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-400/20"
            }`}
            title={recording ? "停止录音并发送" : "发送语音消息"}
          >
            {recording ? "停止" : voiceBusy ? "识别中" : "语音"}
          </button>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={asking || voiceBusy || recording}
            placeholder={asking ? "机器人思考中..." : "和机器人聊聊这个单词..."}
            className="min-w-0 flex-1 rounded-lg border border-indigo-300/25 bg-slate-900/80 px-2 py-1.5 text-xs text-white outline-none placeholder:text-indigo-200/35 focus:border-emerald-300/70 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={asking || !input.trim()}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            发送
          </button>
        </form>
        {voiceHint && (
          <p className="mt-1.5 text-[10px] text-cyan-100/65">{voiceHint}</p>
        )}
      </div>
    </div>
  );
}
