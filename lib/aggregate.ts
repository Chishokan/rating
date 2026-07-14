// 集計・CSV出力の純粋ロジック。
// UI から切り離してテスト可能にしています（ブラウザ非依存）。
// 出力は「1 通知表 = 1 行」の横持ち（10 科目を固定列）。

import { SUBJECTS, type SubjectKey } from "./subjects";
import type { ReportRecord } from "./types";

/** 1 通知表を 1 行に展開した集計用の行（評定セルは空欄を "" に正規化） */
export interface CardRow {
  recordId: string;
  createdAt: string;
  campus: string;
  studentName: string;
  schoolYear: string;
  term: string;
  ratings: Record<SubjectKey, string>;
}

/** 集計サマリ */
export interface Stats {
  /** 登録した通知表の枚数 */
  reportCount: number;
  /** 入力済み（空でない）評定セルの数 */
  filledCount: number;
  /** 数値として解釈できる評定の平均（無ければ null） */
  avg: number | null;
  /** 評定ごとの件数（評定の昇順、空欄は除外） */
  distribution: [string, number][];
}

/** レコード配列を 1 行 = 1 通知表の横持ち行に変換する */
export function toRows(records: ReportRecord[]): CardRow[] {
  return records.map((r) => {
    const ratings = {} as Record<SubjectKey, string>;
    for (const s of SUBJECTS) {
      ratings[s.key] = r.ratings[s.key] ?? "";
    }
    return {
      recordId: r.id,
      createdAt: r.createdAt,
      campus: r.campus ?? "",
      studentName: r.studentName ?? "",
      schoolYear: r.schoolYear ?? "",
      term: r.term ?? "",
      ratings,
    };
  });
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
export function computeStats(records: ReportRecord[]): Stats {
  const rows = toRows(records);
  const cells: string[] = [];
  for (const row of rows) {
    for (const s of SUBJECTS) {
      const v = row.ratings[s.key].trim();
      if (v !== "") cells.push(v);
    }
  }

  const numeric = cells.filter((v) => Number.isFinite(Number(v))).map(Number);
  const avg =
    numeric.length > 0
      ? numeric.reduce((a, b) => a + b, 0) / numeric.length
      : null;

  const distribution = new Map<string, number>();
  for (const v of cells) {
    distribution.set(v, (distribution.get(v) ?? 0) + 1);
  }
  const sortedDist = [...distribution.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ja"),
  );

  return {
    reportCount: records.length,
    filledCount: cells.length,
    avg,
    distribution: sortedDist,
  };
}

