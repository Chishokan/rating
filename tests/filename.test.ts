// Drive 保存用ファイル名の生成テスト。
// 実行: npm test (tsx で TypeScript を実行)

import assert from "node:assert/strict";
import test from "node:test";
import { buildDriveFileName, extForMime } from "../lib/filename.ts";

test("extForMime: MIME から拡張子", () => {
  assert.equal(extForMime("application/pdf"), "pdf");
  assert.equal(extForMime("image/png"), "png");
  assert.equal(extForMime("image/webp"), "webp");
  assert.equal(extForMime("image/gif"), "gif");
  assert.equal(extForMime("image/jpeg"), "jpg");
  assert.equal(extForMime("unknown/type"), "jpg");
});

test("buildDriveFileName: 校舎_氏名_日時.拡張子", () => {
  const when = new Date(2026, 6, 14, 9, 15, 30); // 2026-07-14 09:15:30 ローカル
  assert.equal(
    buildDriveFileName("駅前校", "山田 太郎", "application/pdf", when),
    "駅前校_山田 太郎_20260714-091530.pdf",
  );
});

test("buildDriveFileName: 氏名なしは氏名未取得", () => {
  const when = new Date(2026, 0, 5, 0, 0, 0);
  assert.equal(
    buildDriveFileName("日宇校", null, "image/jpeg", when),
    "日宇校_氏名未取得_20260105-000000.jpg",
  );
});

test("buildDriveFileName: 使用不可文字を除去", () => {
  const when = new Date(2026, 6, 14, 9, 0, 0);
  assert.equal(
    buildDriveFileName("大野校", "A/B:C*?", "image/png", when),
    "大野校_A_B_C___20260714-090000.png",
  );
});
