// 集計・CSV出力の純粋ロジック。
// UI から切り離してテスト可能にしています（ブラウザ非依存）。

import type { ReportRecord } from "./types";

/** 1 科目を 1 行に展開した集計用の行 */
export interface FlatRow {
  recordId: string;
  createdAt: string;
  studentName: string;
  schoolYear: string;
  term: string;
  subject: string;
  rating: string;
}

/** 集計サマリ */
export interface Stats {
  reportCount: number;
  subjectCount: number;
  /** 数値として解釈できる評定の平均（無ければ null） */
  avg: number | null;
  /** 評定ごとの件数（評定の昇順） */
  distribution: [string, number][];
}

/** レコード配列を科目単位の行に展開する */
export function flatten(records: ReportRecord[]): FlatRow[] {
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

/** ISO 日時を "YYYY/MM/DD HH:mm" に整形する。失敗時は入力をそのまま返す */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

/** 集計サマリを計算する */
export function computeStats(records: ReportRecord[], rows: FlatRow[]): Stats {
  // 空文字は数値 0 に化けるため、空でない数値のみを平均対象にする
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
}

/** CSV セルのエスケープ（カンマ・改行・引用符を含む場合はダブルクオートで囲む） */
export function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 集計行から CSV 文字列（ヘッダ付き・CRLF 改行）を生成する */
export function buildCsv(rows: FlatRow[]): string {
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
  return lines.join("\r\n");
}
