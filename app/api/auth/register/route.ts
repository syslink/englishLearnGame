import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  validateUsername,
  validatePassword,
  validateAvatar,
  createSessionToken,
  setSessionCookie,
  rateLimitHit,
  clientIp,
} from "@/lib/auth";
import { uploadImageFromDataUrl, deleteBlobQuiet } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 速率限制：按 IP 限流
  const ip = clientIp(req);
  const rl = rateLimitHit(`register:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } },
    );
  }

  // 防 CSRF：验证 Origin（跨站请求不会携带 cookie，但多一层保险）
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown; avatar?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const usernameErr = validateUsername(body.username);
  if (usernameErr) return NextResponse.json({ error: usernameErr }, { status: 400 });
  const passwordErr = validatePassword(body.password);
  if (passwordErr) return NextResponse.json({ error: passwordErr }, { status: 400 });
  const avatarErr = validateAvatar(body.avatar);
  if (avatarErr) return NextResponse.json({ error: avatarErr }, { status: 400 });

  const username = (body.username as string).trim();
  const password = body.password as string;
  const avatarInput = typeof body.avatar === "string" && body.avatar ? body.avatar : null;
  const usernameLc = username.toLowerCase();

  // 检查用户名是否已存在（先查一次，避免为重名用户浪费 blob 上传）
  const existing = await prisma.user.findUnique({
    where: { usernameLc },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
  }

  // 头像处理：如果是 data URL，上传到 Vercel Blob；如果已经是 http(s) URL，直接存
  let avatarUrl: string | null = null;
  if (avatarInput) {
    try {
      if (avatarInput.startsWith("data:")) {
        avatarUrl = await uploadImageFromDataUrl(avatarInput, "avatars");
      } else if (/^https?:\/\//i.test(avatarInput)) {
        avatarUrl = avatarInput;
      }
    } catch (err) {
      console.error("avatar upload error", err);
      return NextResponse.json(
        { error: "头像上传失败，请稍后重试" },
        { status: 500 },
      );
    }
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: { username, usernameLc, passwordHash, avatar: avatarUrl },
      select: { id: true, username: true, avatar: true, createdAt: true },
    });
  } catch (err) {
    // 并发写入时可能触发 unique 冲突 → 回滚已上传头像
    if ((err as { code?: string })?.code === "P2002") {
      await deleteBlobQuiet(avatarUrl);
      return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
    }
    await deleteBlobQuiet(avatarUrl);
    console.error("register error", err);
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
  }

  const token = await createSessionToken({ uid: user.id, username: user.username });
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: user.id, username: user.username, avatar: user.avatar },
  });
}
