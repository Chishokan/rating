import { NextResponse } from "next/server";

// GAS へのサーバー間 POST（ブラウザからの CORS を避け、URL も秘匿する）
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const url = process.env.GAS_LOG_URL;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "不正なリクエストです。" }, {
      status: 400,
    });
  }

  // 未設定ならスキップ（ログ連携なしでもアプリは動作する）
  if (!url) {
    return NextResponse.json({ ok: false, skipped: true, reason: "unconfigured" });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow", // GAS は googleusercontent へ 302 リダイレクトする
    });
    const text = await res.text();
    return NextResponse.json({ ok: res.ok, upstream: text.slice(0, 300) });
  } catch (err) {
    console.error("log forward error:", err);
    return NextResponse.json(
      { ok: false, error: "ログ送信に失敗しました。" },
      { status: 502 },
    );
  }
}
