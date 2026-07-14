"use client";

import { PDFDocument } from "pdf-lib";
import Link from "next/link";
import { useRef, useState } from "react";
import { CAMPUSES } from "@/lib/campuses";
import { buildDriveFileName } from "@/lib/filename";
import { SUBJECTS, type SubjectKey } from "@/lib/subjects";
import type { ExtractedReportCard, ExtractRequest, Ratings } from "@/lib/types";

type ItemStatus = "pending" | "processing" | "done" | "error";

interface UploadItem {
  id: string;
  fileName: string;
  previewUrl: string | null;
  payload: { base64: string; mediaType: string } | null;
  status: ItemStatus;
  error: string | null;
  draft: ExtractedReportCard | null;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "未解析",
  processing: "解析中",
  done: "解析済み",
  error: "エラー",
};

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyRatings(): Ratings {
  const r = {} as Ratings;
  for (const s of SUBJECTS) r[s.key] = null;
  return r;
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 同時に解析する最大数（429 を避けつつ高速化） */
const CONCURRENCY = 6;

/** 同時に保存送信する最大数（GAS への負荷を抑える） */
const SAVE_CONCURRENCY = 3;

/** PDF の最大サイズ（Vercel のリクエスト上限 4.5MB 以内に収めるため） */
const MAX_PDF_BYTES = 3 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Blob を base64 文字列として読み込む（大きなデータでも安全） */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.split(",")[1] ?? "";
  if (!base64) throw new Error("ファイルを読み込めませんでした。");
  return base64;
}

/**
 * 複数ページ PDF を 1 ページずつの PDF に分割し、各ページを payload 化する。
 * これにより 1 ページ = 1 通知表 として解析でき、Vercel のリクエスト
 * 上限（4.5MB）も回避できる（送るのは常に 1 ページ分だけ）。
 */
async function splitPdfToPayloads(
  file: File,
): Promise<{ base64: string; pageLabel: string; error?: string }[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const results: { base64: string; pageLabel: string; error?: string }[] = [];

  for (let i = 0; i < total; i++) {
    const label = total > 1 ? `${file.name}（p${i + 1}/${total}）` : file.name;
    try {
      const out = await PDFDocument.create();
      const [page] = await out.copyPages(src, [i]);
      out.addPage(page);
      const outBytes = await out.save();
      if (outBytes.length > MAX_PDF_BYTES) {
        results.push({
          base64: "",
          pageLabel: label,
          error: "このページのPDFが大きすぎます（3MB超）。",
        });
        continue;
      }
      const blob = new Blob([outBytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      const base64 = await blobToBase64(blob);
      results.push({ base64, pageLabel: label });
    } catch (err) {
      results.push({
        base64: "",
        pageLabel: label,
        error: errMsg(err, "このページを処理できませんでした。"),
      });
    }
  }
  return results;
}

/** 画像を最大辺 maxEdge px に縮小し、{ base64, mediaType } を返す */
async function fileToScaledBase64(
  file: File,
  maxEdge = 1800,
): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の処理に失敗しました。");
  ctx.drawImage(img, 0, 0, w, h);

  const outUrl = canvas.toDataURL("image/jpeg", 0.9);
  const base64 = outUrl.split(",")[1] ?? "";
  if (!base64) {
    throw new Error(
      "画像を変換できませんでした。別の写真（JPEG/PNG）でお試しください。",
    );
  }
  return { base64, mediaType: "image/jpeg" };
}

async function callExtract(payload: {
  base64: string;
  mediaType: string;
}): Promise<ExtractedReportCard> {
  const reqBody: ExtractRequest = {
    image: payload.base64,
    mediaType: payload.mediaType,
  };
  // レート制限/過負荷/一時的なサーバエラーは最大2回まで自動リトライ
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const data = await res.json();
    if (res.ok) {
      const card = data as ExtractedReportCard;
      return { ...card, ratings: { ...emptyRatings(), ...card.ratings } };
    }
    const msg: string = data.error ?? "解析に失敗しました。";
    const retryable =
      /\((429|500|503|529)\)/.test(msg) || msg.includes("overloaded");
    if (retryable && attempt < 2) {
      await sleep(1200 * (attempt + 1) + Math.random() * 600);
      continue;
    }
    throw new Error(msg);
  }
}

export default function CapturePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [campus, setCampus] = useState<string>("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<
    | { sent: number; failed: number; unconfigured: boolean }
    | null
  >(null);

  const doneCount = items.filter((it) => it.status === "done").length;
  const analyzableCount = items.filter(
    (it) => it.payload && it.status !== "done",
  ).length;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setSaveResult(null);

    // 1 ファイルから複数アイテム（PDFの各ページ）が生じ得るため配列を平坦化
    const perFile: UploadItem[][] = await Promise.all(
      files.map(async (file) => {
        if (isPdfFile(file)) {
          // 複数ページPDF → 1ページずつのアイテムに分割
          try {
            const pages = await splitPdfToPayloads(file);
            return pages.map((p) =>
              p.error
                ? {
                    id: uid(),
                    fileName: p.pageLabel,
                    previewUrl: null,
                    payload: null,
                    status: "error" as ItemStatus,
                    error: p.error,
                    draft: null,
                  }
                : {
                    id: uid(),
                    fileName: p.pageLabel,
                    previewUrl: null,
                    payload: {
                      base64: p.base64,
                      mediaType: "application/pdf",
                    },
                    status: "pending" as ItemStatus,
                    error: null,
                    draft: null,
                  },
            );
          } catch (err) {
            return [
              {
                id: uid(),
                fileName: file.name,
                previewUrl: null,
                payload: null,
                status: "error" as ItemStatus,
                error: errMsg(
                  err,
                  "PDFを読み込めませんでした（暗号化・破損の可能性）。",
                ),
                draft: null,
              },
            ];
          }
        }
        // 画像 → 縮小して 1 アイテム
        try {
          return [
            {
              id: uid(),
              fileName: file.name,
              previewUrl: URL.createObjectURL(file),
              payload: await fileToScaledBase64(file),
              status: "pending" as ItemStatus,
              error: null,
              draft: null,
            },
          ];
        } catch (err) {
          return [
            {
              id: uid(),
              fileName: file.name,
              previewUrl: URL.createObjectURL(file),
              payload: null,
              status: "error" as ItemStatus,
              error: errMsg(err, "ファイルの処理に失敗しました。"),
              draft: null,
            },
          ];
        }
      }),
    );
    const newItems = perFile.flat();
    setItems((prev) => [...prev, ...newItems]);
    // 同じファイルを選び直せるよう値をクリア
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  async function analyzeOne(id: string, payload: UploadItem["payload"]) {
    if (!payload) return;
    patchItem(id, { status: "processing", error: null });
    try {
      const card = await callExtract(payload);
      patchItem(id, { status: "done", draft: card, error: null });
    } catch (err) {
      patchItem(id, {
        status: "error",
        error: errMsg(err, "解析に失敗しました。"),
      });
    }
  }

  async function analyzeAll() {
    setRunning(true);
    setSaveResult(null);
    // 呼び出し時点のスナップショットから対象を決定
    const targets = items.filter(
      (it) => it.payload && it.status !== "done" && it.status !== "processing",
    );
    // 同時実行数を制限したワーカープールで並列解析
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const it = targets[cursor++];
        await analyzeOne(it.id, it.payload);
      }
    };
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, targets.length) },
      () => worker(),
    );
    await Promise.all(workers);
    setRunning(false);
  }

  function updateField(id: string, patch: Partial<ExtractedReportCard>) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.draft
          ? { ...it, draft: { ...it.draft, ...patch } }
          : it,
      ),
    );
  }

  function updateRating(id: string, key: SubjectKey, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.draft
          ? { ...it, draft: { ...it.draft, ratings: { ...it.draft.ratings, [key]: value } } }
          : it,
      ),
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function clearAll() {
    if (items.length > 0 && !window.confirm("選択中の画像をすべて取り消しますか？"))
      return;
    setItems([]);
    setSaveResult(null);
  }

  // 1件を GAS へ送信（スプレッドシート追記＋Driveへファイル保存）。
  // 戻り値: "sent" 成功 / "failed" 失敗 / "unconfigured" 連携未設定
  async function sendOne(
    it: UploadItem,
  ): Promise<"sent" | "failed" | "unconfigured"> {
    const draft = it.draft!;
    const ratings = {} as Ratings;
    for (const s of SUBJECTS) {
      const v = (draft.ratings[s.key] ?? "").trim();
      ratings[s.key] = v === "" ? null : v;
    }
    const mime = it.payload?.mediaType ?? "image/jpeg";
    const body = {
      row: {
        savedAt: new Date().toISOString(),
        campus,
        fileName: it.fileName,
        studentName: draft.studentName,
        schoolYear: draft.schoolYear,
        term: draft.term,
        ratings,
      },
      file: it.payload
        ? {
            name: buildDriveFileName(campus, draft.studentName, mime, new Date()),
            mimeType: mime,
            base64: it.payload.base64,
          }
        : undefined,
    };
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.skipped) return "unconfigured";
      return res.ok && data.ok ? "sent" : "failed";
    } catch {
      return "failed";
    }
  }

  async function saveAll() {
    if (!campus || saving) return;
    const targets = items.filter(
      (it) => it.status === "done" && it.draft && it.payload,
    );
    if (targets.length === 0) return;

    setSaving(true);
    setSaveResult(null);

    // 同時送信数を制限したワーカープール
    const outcomes = new Map<string, "sent" | "failed" | "unconfigured">();
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const it = targets[cursor++];
        outcomes.set(it.id, await sendOne(it));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SAVE_CONCURRENCY, targets.length) }, () =>
        worker(),
      ),
    );

    const sent = [...outcomes.values()].filter((v) => v === "sent").length;
    const failed = [...outcomes.values()].filter((v) => v === "failed").length;
    const unconfigured = [...outcomes.values()].some(
      (v) => v === "unconfigured",
    );

    // 成功したものだけ一覧から除去（失敗・未設定は残して再送信できるように）
    setItems((prev) => prev.filter((it) => outcomes.get(it.id) !== "sent"));
    setSaveResult({ sent, failed, unconfigured });
    setSaving(false);
  }

  return (
    <div>
      <h1>通知表を撮影して評定を登録</h1>
      <p className="subtitle">
        校舎を選び、通知表の画像・PDFを複数まとめてアップロードできます。AIが各ファイルから10科目の評定を読み取ります。
      </p>

      <div className="guide-banner">
        <span>📖 はじめての方は、操作手順をご覧ください。</span>
        <Link className="btn btn-secondary" href="/guide">
          使い方を見る
        </Link>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="campus">① 校舎を選択</label>
          <select
            id="campus"
            value={campus}
            onChange={(e) => setCampus(e.target.value)}
          >
            <option value="">校舎を選択してください</option>
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <label htmlFor="photo">
          ② 通知表の画像・PDF（撮影 / 既存ファイル・複数選択可）
        </label>
        <input
          id="photo"
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          disabled={!campus}
          onChange={handleFiles}
        />
        {!campus ? (
          <p className="muted" style={{ marginTop: 4 }}>
            先に校舎を選択すると写真をアップロードできます。
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 4 }}>
            画像・PDFを複数まとめて選択できます。複数ページのPDFは自動で1ページずつに分割し、各ページを1通知表として解析します（1ページ3MBまで）。
          </p>
        )}
      </div>

      {saveResult !== null && (
        <div
          className="card"
          style={
            saveResult.failed > 0 || saveResult.unconfigured
              ? { borderColor: "#fecaca", background: "#fef2f2" }
              : { borderColor: "#bbf7d0", background: "#f0fdf4" }
          }
        >
          {saveResult.sent > 0 && (
            <p style={{ margin: 0, color: "var(--success)", fontWeight: 600 }}>
              ✓ {saveResult.sent}件をスプレッドシートとDriveに保存しました（校舎:{" "}
              {campus}）。
            </p>
          )}
          {saveResult.unconfigured && (
            <p style={{ margin: "4px 0 0", color: "var(--danger)" }}>
              保存先（スプレッドシート連携）が未設定のため保存できませんでした。管理者にお問い合わせください。
            </p>
          )}
          {saveResult.failed > 0 && (
            <p style={{ margin: "4px 0 0", color: "var(--danger)" }}>
              {saveResult.failed}件の保存に失敗しました。下の一覧に残っているので「まとめて保存」で再送信してください。
            </p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="card">
            <div className="toolbar">
              <button
                className="btn"
                onClick={analyzeAll}
                disabled={running || saving || analyzableCount === 0}
              >
                {running ? (
                  <>
                    <span className="spinner" /> 解析中…
                  </>
                ) : (
                  `③ すべて解析（${analyzableCount}件）`
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={clearAll}
                disabled={running || saving}
              >
                すべてクリア
              </button>
              <span className="muted">
                {items.length}件中 {doneCount}件 解析済み（最大{CONCURRENCY}件並列・枚数制限なし）
              </span>
            </div>

            <div className="btn-row" style={{ marginTop: 0 }}>
              <button
                className="btn"
                onClick={saveAll}
                disabled={running || saving || doneCount === 0 || !campus}
              >
                {saving ? (
                  <>
                    <span className="spinner" /> 保存中…
                  </>
                ) : (
                  `④ 解析済み ${doneCount}件を保存（スプレッドシート＋Drive）`
                )}
              </button>
            </div>
          </div>

          {items.map((it, index) => (
            <div className="card" key={it.id}>
              <div className="item-head">
                {it.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.previewUrl} alt="" className="thumb" />
                ) : (
                  <div className="thumb thumb-pdf">PDF</div>
                )}
                <div style={{ flex: 1 }}>
                  <div className="item-title">
                    {index + 1}. {it.fileName}
                  </div>
                  <span className={`badge badge-${it.status}`}>
                    {STATUS_LABEL[it.status]}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {it.payload && it.status !== "processing" && (
                    <button
                      className="remove-link"
                      style={{ color: "var(--primary)" }}
                      onClick={() => analyzeOne(it.id, it.payload)}
                      disabled={running || saving}
                    >
                      {it.status === "done" ? "再解析" : "解析"}
                    </button>
                  )}
                  <button
                    className="remove-link"
                    onClick={() => removeItem(it.id)}
                    disabled={running || saving}
                  >
                    削除
                  </button>
                </div>
              </div>

              {it.error && <div className="error">{it.error}</div>}

              {it.draft && (
                <>
                  <div className="field-grid">
                    <div className="field">
                      <label>氏名</label>
                      <input
                        type="text"
                        value={it.draft.studentName ?? ""}
                        onChange={(e) =>
                          updateField(it.id, { studentName: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>学年</label>
                      <input
                        type="text"
                        value={it.draft.schoolYear ?? ""}
                        onChange={(e) =>
                          updateField(it.id, { schoolYear: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>学期</label>
                      <input
                        type="text"
                        value={it.draft.term ?? ""}
                        onChange={(e) =>
                          updateField(it.id, { term: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "55%" }}>科目</th>
                        <th>評定</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUBJECTS.map((s) => (
                        <tr key={s.key}>
                          <td>{s.label}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={it.draft!.ratings[s.key] ?? ""}
                              onChange={(e) =>
                                updateRating(it.id, s.key, e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ))}
        </>
      )}

      <p className="muted">
        保存すると、Googleスプレッドシートへの記録と、指定Driveフォルダへのファイル保存が行われます（連携設定が必要です）。
        <Link href="/guide"> 使い方を見る →</Link>
      </p>
    </div>
  );
}
