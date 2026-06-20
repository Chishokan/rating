// 校舎（所属）の一覧。プルダウン・CSV・フィルタで共有します。

export const CAMPUSES = ["駅前校", "日宇校", "大野校", "日野校"] as const;

export type Campus = (typeof CAMPUSES)[number];
