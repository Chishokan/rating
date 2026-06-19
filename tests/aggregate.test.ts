// 集計・CSV ロジックのユニットテスト。
// 実行: npm test  (Node 22 のネイティブ TypeScript 実行を利用)

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCsv,
  computeStats,
  csvCell,
  flatten,
  formatDate,
} from "../lib/aggregate.ts";
import type { ReportRecord } from "../lib/types.ts";

const records: ReportRecord[] = [
  {
    id: "a",
    createdAt: "2026-06-19T01:05:00.000Z",
    studentName: "山田 太郎",
    schoolYear: "中学2年",
    term: "1学期",
    subjects: [
      { subject: "国語", rating: "5" },
      { subject: "数学", rating: "4" },
      { subject: "備考", rating: "" }, // 空欄の評定
    ],
  },
  {
    id: "b",
    createdAt: "2026-06-19T02:30:00.000Z",
    studentName: null,
    schoolYear: null,
    term: null,
    subjects: [
      { subject: "美術", rating: "A" }, // 数値でない評定
      { subject: "保健, 体育", rating: "3" }, // カンマを含む科目名
    ],
  },
];

test("flatten: 全科目を 1 行ずつに展開する", () => {
  const rows = flatten(records);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].subject, "国語");
  // null は空文字に正規化される
  assert.equal(rows[3].studentName, "");
  assert.equal(rows[3].schoolYear, "");
});

test("computeStats: 件数・平均・分布を計算する", () => {
  const rows = flatten(records);
  const stats = computeStats(records, rows);
  assert.equal(stats.reportCount, 2);
  assert.equal(stats.subjectCount, 5);
  // 数値評定は 5, 4, 3 のみ -> 平均 4。空欄や "A" は平均に含めない
  assert.equal(stats.avg, 4);
  // 分布: 空欄は「（空欄）」に集約
  const dist = Object.fromEntries(stats.distribution);
  assert.equal(dist["5"], 1);
  assert.equal(dist["4"], 1);
  assert.equal(dist["3"], 1);
  assert.equal(dist["A"], 1);
  assert.equal(dist["（空欄）"], 1);
});

test("computeStats: 数値評定が無いと平均は null", () => {
  const onlyLetters: ReportRecord[] = [
    {
      id: "c",
      createdAt: "2026-06-19T03:00:00.000Z",
      studentName: null,
      schoolYear: null,
      term: null,
      subjects: [{ subject: "図工", rating: "よくできる" }],
    },
  ];
  const stats = computeStats(onlyLetters, flatten(onlyLetters));
  assert.equal(stats.avg, null);
});

test("csvCell: カンマ・引用符・改行を正しくエスケープする", () => {
  assert.equal(csvCell("国語"), "国語");
  assert.equal(csvCell("保健, 体育"), '"保健, 体育"');
  assert.equal(csvCell('5"評価'), '"5""評価"');
  assert.equal(csvCell("行1\n行2"), '"行1\n行2"');
});

test("buildCsv: ヘッダ付き・カンマを含む値を引用符で囲む", () => {
  const csv = buildCsv(flatten(records));
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "保存日時,氏名,学年,学期,科目,評定");
  // カンマを含む科目名は引用符で囲まれている
  assert.ok(csv.includes('"保健, 体育"'));
  // 行数 = ヘッダ + 5 科目
  assert.equal(lines.length, 6);
});

test("formatDate: ISO を YYYY/MM/DD HH:mm に整形 / 不正値はそのまま", () => {
  // ローカルタイムゾーン依存を避けるため形式のみ検証
  assert.match(formatDate("2026-06-19T01:05:00.000Z"), /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  assert.equal(formatDate("not-a-date"), "not-a-date");
});
