// CSV / 集計で使う 10 科目の正準リスト（並び順 = 列の順序）。
// key: コード上のキー / 内部識別子, label: CSV ヘッダや画面に出す表記,
// aliases: 通知表上で現れうる別表記（プロンプトのマッピング指示に使用）。

export interface SubjectDef {
  key: string;
  label: string;
  aliases: string[];
}

export const SUBJECTS = [
  { key: "kokugo", label: "国語", aliases: ["国語"] },
  {
    key: "eigo",
    label: "英語",
    aliases: ["英語", "外国語", "外国語（英語）", "英語（外国語）"],
  },
  { key: "sugaku", label: "数学", aliases: ["数学", "算数"] },
  { key: "rika", label: "理科", aliases: ["理科"] },
  { key: "shakai", label: "社会", aliases: ["社会", "地理", "歴史", "公民"] },
  { key: "ongaku", label: "音楽", aliases: ["音楽"] },
  { key: "bijutsu", label: "美術", aliases: ["美術", "図画工作", "図工"] },
  {
    key: "hotai",
    label: "保体",
    aliases: ["保健体育", "保健・体育", "体育", "保健"],
  },
  {
    key: "kateika",
    label: "家庭科",
    aliases: ["家庭科", "家庭", "技術・家庭（家庭分野）", "家庭分野"],
  },
  {
    key: "gijutsu",
    label: "技術",
    aliases: ["技術", "技術・家庭（技術分野）", "技術分野"],
  },
] as const satisfies readonly SubjectDef[];

/** 10 科目のキーのユニオン型 */
export type SubjectKey = (typeof SUBJECTS)[number]["key"];

/** キーの配列 */
export const SUBJECT_KEYS = SUBJECTS.map((s) => s.key) as SubjectKey[];
