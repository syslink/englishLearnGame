import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英语语音打词游戏",
  description: "支持自定义词库、3秒语音挑战、下落单词爆炸消除与评分",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
