// 集計・CSV ロジックのユニットテスト（横持ち・10科目固定列）。
// 実行: npm test  (Node 22 のネイティブ TypeScript 実行を利用)

import assert from "node:assert/strict";
import test from "node:test";
import {
  CSV_HEADER,
  buildCsv,
  computeStats,
  csvCell,
  formatDate,
  toRows,
} from "../lib/aggregate.ts";
import type { Ratings } from "../lib/types.ts";
import type { ReportRecord } from "../lib/types.ts";

/** テスト用に部分指定で評定マップを作る */
function ratings(partial: Partial<Ratings>): Ratings {
  return {
    kokugo: null,
    eigo: null,
    sugaku: null,
    rika: null,
    shakai: null,
    ongaku: null,
    bijutsu: null,
    hotai: null,
    kateika: null,
    gijutsu: null,
    ...partial,
  };
}

const records: ReportRecord[] = [
  {
    id: "1",
    createdAt: "2026-06-19T01:05:00.000Z",
    studentName: "山田 太郎",
    schoolYear: "中学2年",
    term: "1学期",
    ratings: ratings({
      kokugo: "4",
      eigo: "3",
      sugaku: "3",
      rika: "4",
      shakai: "5",
      ongaku: "5",
      bijutsu: "4",
      hotai: "4",
      kateika: "3",
      gijutsu: "3",
    }),
  },
  {
    id: "2",
    createdAt: "2026-06-19T02:30:00.000Z",
    studentName: "佐藤 花子",
    schoolYear: "中学2年",
    term: "1学期",
    // 一部の科目のみ読み取り（数学が読めず空欄、美術は記号A）
    ratings: ratings({ kokugo: "5", bijutsu: "A" }),
  },
];

test("CSV_HEADER: 指定どおりの14列", () => {
  assert.deepEqual(CSV_HEADER, [
    "保存日時",
    "氏名",
    "学年",
    "学期",
    "国語",
    "英語",
    "数学",
    "理科",
    "社会",
    "音楽",
    "美術",
    "保体",
    "家庭科",
    "技術",
  ]);
});

test("toRows: 1通知表=1行、空欄は空文字に正規化", () => {
  const rows = toRows(records);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ratings.kokugo, "4");
  // 読み取れなかった科目は ""（null ではなく）
  assert.equal(rows[1].ratings.sugaku, "");
  assert.equal(rows[1].ratings.eigo, "");
});

test("computeStats: 枚数・入力済み数・平均・分布", () => {
  const stats = computeStats(records);
  assert.equal(stats.reportCount, 2);
  // 1人目10科目 + 2人目2科目 = 12 セル
  assert.equal(stats.filledCount, 12);
  // 数値セルのみで平均（"A" は除外）。1人目: 4+3+3+4+5+5+4+4+3+3=38, 2人目: 5 -> 43/11
  assert.ok(Math.abs(stats.avg! - 43 / 11) < 1e-9);
  const dist = Object.fromEntries(stats.distribution);
  assert.equal(dist["3"], 4);
  assert.equal(dist["4"], 4);
  assert.equal(dist["5"], 3);
  assert.equal(dist["A"], 1);
});

test("computeStats: 数値評定が無いと平均は null", () => {
  const onlyLetters: ReportRecord[] = [
    {
      id: "c",
      createdAt: "2026-06-19T03:00:00.000Z",
      studentName: null,
      schoolYear: null,
      term: null,
      ratings: ratings({ bijutsu: "A" }),
    },
  ];
  assert.equal(computeStats(onlyLetters).avg, null);
});

test("buildCsv: ヘッダ + 1行=1通知表、空欄は空セル", () => {
  const csv = buildCsv(records);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "保存日時,氏名,学年,学期,国語,英語,数学,理科,社会,音楽,美術,保体,家庭科,技術");
  assert.equal(lines.length, 3); // ヘッダ + 2件
  // 2人目: 国語5・美術A 以外は空欄。日時はTZ依存のため先頭列を除いて検証
  const fields = lines[2].split(",");
  assert.equal(
    fields.slice(1).join(","),
    "佐藤 花子,中学2年,1学期,5,,,,,,A,,,",
  );
});

test("csvCell: カンマ・引用符・改行をエスケープ", () => {
  assert.equal(csvCell("5"), "5");
  assert.equal(csvCell("中学2年"), "中学2年");
  assert.equal(csvCell("山田, 太郎"), '"山田, 太郎"');
  assert.equal(csvCell('A"評価'), '"A""評価"');
});

test("formatDate: ISO整形 / 不正値はそのまま", () => {
  assert.match(
    formatDate("2026-06-19T01:05:00.000Z"),
    /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
  );
  assert.equal(formatDate("not-a-date"), "not-a-date");
});
