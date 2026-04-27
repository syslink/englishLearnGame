import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// 热重载 / serverless 场景下复用 Prisma Client 单例，避免耗尽连接池。
// 当 DATABASE_URL 为 prisma+postgres:// (Prisma Postgres / Accelerate) 时，
// withAccelerate() 会让 Client 走 HTTP API；否则行为等同于普通 PrismaClient。
type ExtendedPrisma = ReturnType<typeof createPrisma>;

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends(withAccelerate());
}

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrisma | undefined;
};

export const prisma: ExtendedPrisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
