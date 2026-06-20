// 通知表から抽出するデータの型定義。
// API ルートと UI で共有します。

import type { SubjectKey } from "./subjects";

/** 10 科目の評定。読み取れた科目に評定（多くは数値）、無ければ null */
export type Ratings = Record<SubjectKey, string | null>;

/** Claude Vision API が 1 枚の通知表から抽出する構造 */
export interface ExtractedReportCard {
  /** 児童・生徒の氏名（読み取れない場合は null） */
  studentName: string | null;
  /** 学年（例: "中学2年", "小学5年"。読み取れない場合は null） */
  schoolYear: string | null;
  /** 学期・期間（例: "1学期", "前期", "学年末"。読み取れない場合は null） */
  term: string | null;
  /** 10 科目の評定 */
  ratings: Ratings;
}

/** localStorage に保存する 1 レコード（抽出結果＋メタ情報） */
export interface ReportRecord extends ExtractedReportCard {
  /** 一意なID */
  id: string;
  /** 保存日時（ISO 8601） */
  createdAt: string;
}
