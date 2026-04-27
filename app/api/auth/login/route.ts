import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  validateUsername,
  validatePassword,
  createSessionToken,
  setSessionCookie,
  rateLimitHit,
  clientIp,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimitHit(`login:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "登录尝试过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } },
    );
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  // 使用与注册相同的校验，但返回统一错误以防用户枚举
  if (validateUsername(body.username) || validatePassword(body.password)) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const usernameLc = (body.username as string).trim().toLowerCase();
  const password = body.password as string;

  const user = await prisma.user.findUnique({
    where: { usernameLc },
    select: { id: true, username: true, passwordHash: true, avatar: true },
  });

  // 即使用户不存在也跑一次 bcrypt 比较，避免通过响应时间枚举用户
  const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8pqFwR/CfZ0oTp9EymvH7lqsXoVCTa";
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : (await verifyPassword(password, DUMMY_HASH), false);

  if (!user || !ok) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  // 更新登录时间（失败静默，不影响登录）
  prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  const token = await createSessionToken({ uid: user.id, username: user.username });
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: user.id, username: user.username, avatar: user.avatar },
  });
}
