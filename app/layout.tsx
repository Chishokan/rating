import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "通知表 評定集計",
  description: "写真を撮ると通知表の評定をCSVに集計するWebアプリ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <header className="header">
          <Link href="/" className="brand">
            📷 通知表 評定集計
          </Link>
          <nav className="nav">
            <Link href="/">撮影・登録</Link>
            <Link href="/guide" className="nav-guide">
              使い方
            </Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
