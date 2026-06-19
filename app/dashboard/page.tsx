"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clearRecords, deleteRecord, loadRecords } from "@/lib/storage";
import type { ReportRecord } from "@/lib/types";

interface FlatRow {
  recordId: string;
  createdAt: string;
  studentName: string;
  schoolYear: string;
  term: string;
  subject: string;
  rating: string;
}

function flatten(records: ReportRecord[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const r of records) {
    for (const s of r.subjects) {
      rows.push({
        recordId: r.id,
        createdAt: r.createdAt,
        studentName: r.studentName ?? "",
        schoolYear: r.schoolYear ?? "",
        term: r.term ?? "",
        subject: s.subject,
        rating: s.rating,
      });
    }
  }
  return rows;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** CSV セルのエスケープ */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(rows: FlatRow[]): void {
  const header = ["保存日時", "氏名", "学年", "学期", "科目", "評定"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        formatDate(row.createdAt),
        row.studentName,
        row.schoolYear,
        row.term,
        row.subject,
        row.rating,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // Excel で文字化けしないよう BOM 付き UTF-8 で出力
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
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

  const rows = useMemo(() => flatten(records), [records]);

  // 数値評定の平均と評定ごとの件数を集計
  const stats = useMemo(() => {
    const numericRatings = rows
      .map((r) => r.rating.trim())
      .filter((s) => s !== "" && Number.isFinite(Number(s)))
      .map((s) => Number(s));
    const avg =
      numericRatings.length > 0
        ? numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length
        : null;

    const distribution = new Map<string, number>();
    for (const r of rows) {
      const key = r.rating.trim() || "（空欄）";
      distribution.set(key, (distribution.get(key) ?? 0) + 1);
    }
    const sortedDist = [...distribution.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "ja"),
    );

    return {
      reportCount: records.length,
      subjectCount: rows.length,
      avg,
      distribution: sortedDist,
    };
  }, [rows, records.length]);

  function handleDelete(id: string) {
    if (!window.confirm("このレコードを削除しますか？")) return;
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
                <div className="value">{stats.subjectCount}</div>
                <div className="label">科目数（合計）</div>
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
              <button className="btn" onClick={() => downloadCsv(rows)}>
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
            <h3 style={{ marginTop: 0 }}>明細</h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>保存日時</th>
                    <th>氏名</th>
                    <th>学年</th>
                    <th>学期</th>
                    <th>科目</th>
                    <th>評定</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={`${row.recordId}-${i}`}>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>{row.studentName}</td>
                      <td>{row.schoolYear}</td>
                      <td>{row.term}</td>
                      <td>{row.subject}</td>
                      <td>{row.rating}</td>
                      <td>
                        <button
                          className="remove-link"
                          onClick={() => handleDelete(row.recordId)}
                        >
                          枚ごと削除
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
