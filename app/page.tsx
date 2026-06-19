"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addRecord } from "@/lib/storage";
import type { ExtractedReportCard, SubjectRating } from "@/lib/types";

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
  const base64 = outUrl.split(",")[1];
  return { base64, mediaType: "image/jpeg" };
}

export default function CapturePage() {
  const router = useRouter();
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
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imagePayload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解析に失敗しました。");
      }
      setDraft(data as ExtractedReportCard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(patch: Partial<ExtractedReportCard>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateSubject(index: number, patch: Partial<SubjectRating>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const subjects = prev.subjects.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      );
      return { ...prev, subjects };
    });
  }

  function addSubjectRow() {
    setDraft((prev) =>
      prev ? { ...prev, subjects: [...prev.subjects, { subject: "", rating: "" }] } : prev,
    );
  }

  function removeSubject(index: number) {
    setDraft((prev) =>
      prev
        ? { ...prev, subjects: prev.subjects.filter((_, i) => i !== index) }
        : prev,
    );
  }

  function handleSave() {
    if (!draft) return;
    const cleaned: ExtractedReportCard = {
      ...draft,
      subjects: draft.subjects.filter(
        (s) => s.subject.trim() !== "" || s.rating.trim() !== "",
      ),
    };
    addRecord(cleaned);
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
        通知表の写真を撮る（または選ぶ）と、AIが科目ごとの評定を読み取ります。内容を確認してから保存してください。
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

          <table>
            <thead>
              <tr>
                <th style={{ width: "55%" }}>科目</th>
                <th>評定</th>
                <th style={{ width: "60px" }}></th>
              </tr>
            </thead>
            <tbody>
              {draft.subjects.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={s.subject}
                      onChange={(e) => updateSubject(i, { subject: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={s.rating}
                      onChange={(e) => updateSubject(i, { rating: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="remove-link"
                      onClick={() => removeSubject(i)}
                      aria-label="削除"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="btn-row">
            <button className="btn btn-secondary" onClick={addSubjectRow}>
              ＋ 科目を追加
            </button>
          </div>

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
