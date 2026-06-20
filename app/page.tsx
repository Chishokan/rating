"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SUBJECTS, type SubjectKey } from "@/lib/subjects";
import { addRecord } from "@/lib/storage";
import type { ExtractedReportCard, ExtractRequest, Ratings } from "@/lib/types";

/** 空の評定マップ */
function emptyRatings(): Ratings {
  const r = {} as Ratings;
  for (const s of SUBJECTS) r[s.key] = null;
  return r;
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

export default function CapturePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{
    base64: string;
    mediaType: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedReportCard | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDraft(null);
    setSaved(false);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const payload = await fileToScaledBase64(file);
      setImagePayload(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の処理に失敗しました。");
      setImagePayload(null);
    }
  }

  async function handleExtract() {
    if (!imagePayload) return;
    setLoading(true);
    setError(null);
    try {
      const reqBody: ExtractRequest = {
        image: imagePayload.base64,
        mediaType: imagePayload.mediaType,
      };
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解析に失敗しました。");
      }
      const card = data as ExtractedReportCard;
      // 念のため全科目キーを補完
      setDraft({ ...card, ratings: { ...emptyRatings(), ...card.ratings } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(patch: Partial<ExtractedReportCard>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateRating(key: SubjectKey, value: string) {
    setDraft((prev) =>
      prev ? { ...prev, ratings: { ...prev.ratings, [key]: value } } : prev,
    );
  }

  function handleSave() {
    if (!draft) return;
    const ratings = {} as Ratings;
    for (const s of SUBJECTS) {
      const v = (draft.ratings[s.key] ?? "").trim();
      ratings[s.key] = v === "" ? null : v;
    }
    addRecord({ ...draft, ratings });
    setSaved(true);
  }

  function reset() {
    setPreviewUrl(null);
    setImagePayload(null);
    setDraft(null);
    setError(null);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <h1>通知表を撮影して評定を登録</h1>
      <p className="subtitle">
        通知表の写真を撮る（または選ぶ）と、AIが10科目の評定を読み取ります。内容を確認してから保存してください。
      </p>

      <div className="card">
        <label htmlFor="photo">① 通知表の写真</label>
        <input
          id="photo"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
        />
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="通知表のプレビュー" className="preview" />
        )}

        {imagePayload && !draft && (
          <div className="btn-row">
            <button className="btn" onClick={handleExtract} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" /> 解析中…
                </>
              ) : (
                "② 評定を読み取る"
              )}
            </button>
            <button className="btn btn-secondary" onClick={reset}>
              やり直す
            </button>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {draft && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>③ 読み取り結果を確認・修正</h2>
          <div className="field-grid">
            <div className="field">
              <label>氏名</label>
              <input
                type="text"
                value={draft.studentName ?? ""}
                onChange={(e) => updateDraft({ studentName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>学年</label>
              <input
                type="text"
                value={draft.schoolYear ?? ""}
                onChange={(e) => updateDraft({ schoolYear: e.target.value })}
              />
            </div>
            <div className="field">
              <label>学期</label>
              <input
                type="text"
                value={draft.term ?? ""}
                onChange={(e) => updateDraft({ term: e.target.value })}
              />
            </div>
          </div>

          <p className="muted" style={{ marginTop: 0 }}>
            読み取れなかった科目は空欄のままで構いません。
          </p>
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
                      value={draft.ratings[s.key] ?? ""}
                      onChange={(e) => updateRating(s.key, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {saved ? (
            <div className="btn-row">
              <span style={{ color: "var(--success)", fontWeight: 600 }}>
                ✓ 保存しました。
              </span>
              <Link className="btn" href="/dashboard">
                集計を見る
              </Link>
              <button className="btn btn-secondary" onClick={reset}>
                続けて登録
              </button>
            </div>
          ) : (
            <div className="btn-row">
              <button className="btn" onClick={handleSave}>
                ④ この内容で保存
              </button>
              <button className="btn btn-secondary" onClick={reset}>
                やり直す
              </button>
            </div>
          )}
        </div>
      )}

      <p className="muted">
        データはこの端末のブラウザ内（localStorage）にのみ保存されます。
        <Link href="/dashboard"> 集計・CSV出力ページへ →</Link>
      </p>
    </div>
  );
}
