"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildCsv, computeStats, formatDate, toRows } from "@/lib/aggregate";
import { SUBJECTS } from "@/lib/subjects";
import { clearRecords, deleteRecord, loadRecords } from "@/lib/storage";
import type { ReportRecord } from "@/lib/types";

function downloadCsv(csv: string): void {
  // Excel で文字化けしないよう BOM 付き UTF-8 で出力
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `通知表集計_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRecords(loadRecords());
    setMounted(true);
  }, []);

  const rows = useMemo(() => toRows(records), [records]);
  const stats = useMemo(() => computeStats(records), [records]);

  function handleDelete(id: string) {
    if (!window.confirm("この通知表のレコードを削除しますか？")) return;
    setRecords(deleteRecord(id));
  }

  function handleClearAll() {
    if (!window.confirm("保存した全データを削除します。よろしいですか？")) return;
    clearRecords();
    setRecords([]);
  }

  if (!mounted) {
    return <p className="muted">読み込み中…</p>;
  }

  return (
    <div>
      <h1>評定の集計</h1>
      <p className="subtitle">
        登録した通知表の評定を一覧・集計します。CSVに書き出せばスプレッドシートで開けます。
      </p>

      {records.length === 0 ? (
        <div className="card">
          <p>まだデータがありません。</p>
          <Link className="btn" href="/">
            通知表を撮影する
          </Link>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="stat-grid">
              <div className="stat">
                <div className="value">{stats.reportCount}</div>
                <div className="label">登録枚数</div>
              </div>
              <div className="stat">
                <div className="value">{stats.filledCount}</div>
                <div className="label">入力済み科目数</div>
              </div>
              <div className="stat">
                <div className="value">
                  {stats.avg !== null ? stats.avg.toFixed(2) : "—"}
                </div>
                <div className="label">数値評定の平均</div>
              </div>
            </div>

            <h3>評定の分布</h3>
            <table>
              <thead>
                <tr>
                  <th>評定</th>
                  <th>件数</th>
                </tr>
              </thead>
              <tbody>
                {stats.distribution.map(([rating, count]) => (
                  <tr key={rating}>
                    <td>{rating}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="btn-row">
              <button
                className="btn"
                onClick={() => downloadCsv(buildCsv(records))}
              >
                ⬇ CSVをダウンロード
              </button>
              <Link className="btn btn-secondary" href="/">
                ＋ 続けて登録
              </Link>
              <button className="btn btn-danger" onClick={handleClearAll}>
                全データ削除
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>明細（1行 = 1通知表）</h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>保存日時</th>
                    <th>氏名</th>
                    <th>学年</th>
                    <th>学期</th>
                    {SUBJECTS.map((s) => (
                      <th key={s.key}>{s.label}</th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.recordId}>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>{row.studentName}</td>
                      <td>{row.schoolYear}</td>
                      <td>{row.term}</td>
                      {SUBJECTS.map((s) => (
                        <td key={s.key}>{row.ratings[s.key]}</td>
                      ))}
                      <td>
                        <button
                          className="remove-link"
                          onClick={() => handleDelete(row.recordId)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
