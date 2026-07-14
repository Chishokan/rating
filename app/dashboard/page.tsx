"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { computeStats, formatDate, toRows } from "@/lib/aggregate";
import { CAMPUSES } from "@/lib/campuses";
import { SUBJECTS } from "@/lib/subjects";
import { clearRecords, deleteRecord, loadRecords } from "@/lib/storage";
import type { ReportRecord } from "@/lib/types";

export default function DashboardPage() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const [campusFilter, setCampusFilter] = useState<string>("");

  useEffect(() => {
    setRecords(loadRecords());
    setMounted(true);
  }, []);

  // 校舎フィルタを適用したレコード（集計・一覧・CSVの対象）
  const filtered = useMemo(
    () =>
      campusFilter
        ? records.filter((r) => (r.campus ?? "") === campusFilter)
        : records,
    [records, campusFilter],
  );

  const rows = useMemo(() => toRows(filtered), [filtered]);
  const stats = useMemo(() => computeStats(filtered), [filtered]);

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

  if (records.length === 0) {
    return (
      <div>
        <h1>評定の集計</h1>
        <div className="card">
          <p>まだデータがありません。</p>
          <Link className="btn" href="/">
            通知表を撮影する
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>評定の集計</h1>
      <p className="subtitle">
        登録した通知表の評定を校舎ごとに集計します。保存した内容はGoogleスプレッドシートにも自動記録されます（連携設定時）。
      </p>

      <div className="card">
        <div className="filter-bar">
          <label htmlFor="campusFilter" style={{ margin: 0 }}>
            校舎で絞り込み
          </label>
          <select
            id="campusFilter"
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value)}
          >
            <option value="">すべて（{records.length}件）</option>
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}（{records.filter((r) => (r.campus ?? "") === c).length}件）
              </option>
            ))}
          </select>
          <span className="muted">表示: {filtered.length}件</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <p>この校舎のデータはありません。</p>
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
              <Link className="btn" href="/">
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
                    <th>校舎</th>
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
                      <td>{row.campus}</td>
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
