import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlyWord 飞词 · 开口就记住",
  description: "FlyWord 飞词——AI 生成词库 + 语音识别 + 游戏化记词，看中文喊英文，边玩边学，让单词像飞机一样被你击落。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
