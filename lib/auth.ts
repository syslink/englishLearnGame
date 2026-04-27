import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const BCRYPT_ROUNDS = 12;
const JWT_ALG = "HS256";
const COOKIE_NAME = "flyword_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "AUTH_SECRET 环境变量缺失或过短（至少 32 字符）。请在 .env / Vercel 环境变量中配置。",
    );
  }
  return new TextEncoder().encode(raw);
}

// ---- 密码 ----
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// ---- JWT / Session ----
export type SessionPayload = {
  uid: string;
  username: string;
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [JWT_ALG],
    });
    if (
      typeof payload.uid === "string" &&
      typeof payload.username === "string"
    ) {
      return { uid: payload.uid, username: payload.username };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ---- 输入校验 ----
// 用户名：3-20 位，字母/数字/下划线/中文
const USERNAME_RE = /^[\w\u4e00-\u9fa5]{3,20}$/;
// 密码：8-72 位（bcrypt 上限 72 字节），必须含字母和数字
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export function validateUsername(username: unknown): string | null {
  if (typeof username !== "string") return "用户名格式无效";
  const u = username.trim();
  if (!u) return "用户名不能为空";
  if (!USERNAME_RE.test(u)) return "用户名为 3-20 位字母/数字/下划线/中文";
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "密码格式无效";
  if (password.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 位`;
  if (password.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 位`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "密码必须同时包含字母和数字";
  }
  return null;
}

// 头像：允许 http(s) URL 或 data:image/* 的 base64（最大约 200KB）
const AVATAR_MAX_LEN = 220_000;
const AVATAR_URL_RE = /^https?:\/\/[^\s]{1,500}$/i;
const AVATAR_DATA_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

export function validateAvatar(avatar: unknown): string | null {
  if (avatar === null || avatar === undefined || avatar === "") return null; // 允许为空
  if (typeof avatar !== "string") return "头像格式无效";
  if (avatar.length > AVATAR_MAX_LEN) {
    return "头像过大（超过约 160KB），请压缩后再上传";
  }
  if (!AVATAR_URL_RE.test(avatar) && !AVATAR_DATA_RE.test(avatar)) {
    return "头像必须为 http(s) URL 或 data:image/* base64";
  }
  return null;
}

// ---- 工具 ----
// 简易本机速率限制：每个 IP 的 (registerKey/loginKey) 在 1 分钟内最多 10 次
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

export function rateLimitHit(key: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= RATE_MAX) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
