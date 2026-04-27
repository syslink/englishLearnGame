import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, username: true, avatar: true, createdAt: true, lastLoginAt: true },
  });
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}
