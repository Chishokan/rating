"use client";

import type { ExtractedReportCard, ReportRecord } from "./types";

const STORAGE_KEY = "tsuchihyo-records";

/** 保存済みの全レコードを取得する */
export function loadRecords(): ReportRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReportRecord[]) : [];
  } catch {
    return [];
  }
}

function persist(records: ReportRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** 抽出結果を新規レコードとして追加し、追加後の一覧を返す */
export function addRecord(
  card: ExtractedReportCard,
  campus: string,
): ReportRecord[] {
  const record: ReportRecord = {
    ...card,
    campus,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const records = [record, ...loadRecords()];
  persist(records);
  return records;
}

/** 指定IDのレコードを削除し、削除後の一覧を返す */
export function deleteRecord(id: string): ReportRecord[] {
  const records = loadRecords().filter((r) => r.id !== id);
  persist(records);
  return records;
}

/** 全レコードを削除する */
export function clearRecords(): void {
  persist([]);
}
