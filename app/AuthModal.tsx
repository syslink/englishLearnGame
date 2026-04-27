"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type AuthUser = {
  id: string;
  username: string;
  avatar: string | null;
};

const AVATAR_MAX_BYTES = 160 * 1024; // 客户端侧限制 160KB

export default function AuthModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setUsername("");
    setPassword("");
    setAvatarData(null);
    setError(null);
  }, []);

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setAvatarData(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("图片太大（上限 160KB），请先压缩");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarData(reader.result);
      }
    };
    reader.onerror = () => setError("头像读取失败");
    reader.readAsDataURL(file);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setLoading(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload: Record<string, string> =
        mode === "login"
          ? { username: username.trim(), password }
          : { username: username.trim(), password, avatar: avatarData || "" };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data.error || `请求失败 (${resp.status})`);
        return;
      }
      onSuccess(data.user as AuthUser);
      reset();
      onClose();
    } catch (err) {
      setError((err as Error).message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [mode, username, password, avatarData, onSuccess, onClose, reset]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-indigo-300/30 bg-slate-950/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-indigo-100">
            {mode === "login" ? "登录 FlyWord" : "注册新账号"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-lg text-indigo-300/70 hover:bg-indigo-400/20 hover:text-white"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {mode === "register" && (
          <div className="mb-3 flex flex-col items-center gap-2">
            <div
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-indigo-300/40 bg-slate-900/80"
            >
              {avatarData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarData} alt="头像预览" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl text-indigo-300/50">👤</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-indigo-300/35 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-100 hover:bg-indigo-400/20"
              >
                选择头像
              </button>
              {avatarData && (
                <button
                  type="button"
                  onClick={() => setAvatarData(null)}
                  className="rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-1 text-xs text-rose-100 hover:bg-rose-400/20"
                >
                  移除
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <p className="text-[10px] text-indigo-300/50">可选 · 建议小于 160KB</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-indigo-200/80">用户名</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={loading}
              placeholder="3-20 位字母/数字/下划线/中文"
              className="mt-1 w-full rounded-lg border border-indigo-300/30 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-indigo-300/40 outline-none focus:border-emerald-400/60 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-indigo-200/80">密码</label>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={loading}
              placeholder={mode === "register" ? "至少 8 位，含字母和数字" : "请输入密码"}
              className="mt-1 w-full rounded-lg border border-indigo-300/30 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-indigo-300/40 outline-none focus:border-emerald-400/60 disabled:opacity-60"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "处理中..." : mode === "login" ? "登录" : "注册并登录"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          disabled={loading}
          className="mt-2 w-full text-center text-xs text-indigo-300/80 hover:text-white"
        >
          {mode === "login" ? "还没有账号？点击注册" : "已有账号？点击登录"}
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
