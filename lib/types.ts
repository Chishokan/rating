// 通知表から抽出するデータの型定義。
// API ルートと UI で共有します。

/** 1 科目分の評定 */
export interface SubjectRating {
  /** 科目名（例: 国語, 数学, 英語） */
  subject: string;
  /** 評定（例: "5", "A", "よくできる" など、通知表の記載をそのまま） */
  rating: string;
}

/** Claude Vision API が 1 枚の通知表から抽出する構造 */
export interface ExtractedReportCard {
  /** 児童・生徒の氏名（読み取れない場合は null） */
  studentName: string | null;
  /** 学年（例: "中学2年", "小学5年"。読み取れない場合は null） */
  schoolYear: string | null;
  /** 学期・期間（例: "1学期", "前期", "学年末"。読み取れない場合は null） */
  term: string | null;
  /** 科目ごとの評定一覧 */
  subjects: SubjectRating[];
}

/** localStorage に保存する 1 レコード（抽出結果＋メタ情報） */
export interface ReportRecord extends ExtractedReportCard {
  /** 一意なID */
  id: string;
  /** 保存日時（ISO 8601） */
  createdAt: string;
}
