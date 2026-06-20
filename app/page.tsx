"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CAMPUSES } from "@/lib/campuses";
import { SUBJECTS, type SubjectKey } from "@/lib/subjects";
import { addRecord } from "@/lib/storage";
import type { ExtractedReportCard, ExtractRequest, Ratings } from "@/lib/types";

type ItemStatus = "pending" | "processing" | "done" | "error";

interface UploadItem {
  id: string;
  fileName: string;
  previewUrl: string;
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
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "解析に失敗しました。");
  const card = data as ExtractedReportCard;
  return { ...card, ratings: { ...emptyRatings(), ...card.ratings } };
}

export default function CapturePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [campus, setCampus] = useState<string>("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const doneCount = items.filter((it) => it.status === "done").length;
  const analyzableCount = items.filter(
    (it) => it.payload && it.status !== "done",
  ).length;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setSavedCount(null);

    const newItems: UploadItem[] = await Promise.all(
      files.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        try {
          const payload = await fileToScaledBase64(file);
          return {
            id: uid(),
            fileName: file.name,
            previewUrl,
            payload,
            status: "pending" as ItemStatus,
            error: null,
            draft: null,
          };
        } catch (err) {
          return {
            id: uid(),
            fileName: file.name,
            previewUrl,
            payload: null,
            status: "error" as ItemStatus,
            error: errMsg(err, "画像の処理に失敗しました。"),
            draft: null,
          };
        }
      }),
    );
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
    setSavedCount(null);
    // 呼び出し時点のスナップショットから対象を決定（順次処理）
    const targets = items.filter(
      (it) => it.payload && it.status !== "done" && it.status !== "processing",
    );
    for (const it of targets) {
      await analyzeOne(it.id, it.payload);
    }
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
    setSavedCount(null);
  }

  function saveAll() {
    if (!campus) return;
    const toSave = items.filter((it) => it.status === "done" && it.draft);
    for (const it of toSave) {
      const ratings = {} as Ratings;
      for (const s of SUBJECTS) {
        const v = (it.draft!.ratings[s.key] ?? "").trim();
        ratings[s.key] = v === "" ? null : v;
      }
      addRecord({ ...it.draft!, ratings }, campus);
    }
    setSavedCount(toSave.length);
    setItems([]);
  }

  return (
    <div>
      <h1>通知表を撮影して評定を登録</h1>
      <p className="subtitle">
        校舎を選び、通知表の写真を複数まとめてアップロードできます。AIが各画像から10科目の評定を読み取ります。
      </p>

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
          ② 通知表の写真（撮影 / 既存写真・複数選択可）
        </label>
        <input
          id="photo"
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
            複数枚まとめて選択できます。追加で選ぶと末尾に足されます。
          </p>
        )}
      </div>

      {savedCount !== null && (
        <div
          className="card"
          style={{ borderColor: "#bbf7d0", background: "#f0fdf4" }}
        >
          <p style={{ margin: 0, color: "var(--success)", fontWeight: 600 }}>
            ✓ {savedCount}件を保存しました（校舎: {campus}）。
          </p>
          <div className="btn-row">
            <Link className="btn" href="/dashboard">
              集計を見る
            </Link>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="card">
            <div className="toolbar">
              <button
                className="btn"
                onClick={analyzeAll}
                disabled={running || analyzableCount === 0}
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
                disabled={running}
              >
                すべてクリア
              </button>
              <span className="muted">
                {items.length}件中 {doneCount}件 解析済み
              </span>
            </div>

            <div className="btn-row" style={{ marginTop: 0 }}>
              <button
                className="btn"
                onClick={saveAll}
                disabled={running || doneCount === 0 || !campus}
              >
                ④ 解析済み {doneCount}件をまとめて保存
              </button>
            </div>
          </div>

          {items.map((it, index) => (
            <div className="card" key={it.id}>
              <div className="item-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.previewUrl} alt="" className="thumb" />
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
                      disabled={running}
                    >
                      {it.status === "done" ? "再解析" : "解析"}
                    </button>
                  )}
                  <button
                    className="remove-link"
                    onClick={() => removeItem(it.id)}
                    disabled={running}
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
        データはこの端末のブラウザ内（localStorage）にのみ保存されます。
        <Link href="/dashboard"> 集計・CSV出力ページへ →</Link>
      </p>
    </div>
  );
}
