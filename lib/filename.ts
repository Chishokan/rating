// Drive 保存用のファイル名を組み立てる純粋関数。

/** MIME タイプから拡張子を返す */
export function extForMime(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/** ファイル名に使えない文字を除去する */
function sanitize(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]/g, "_").trim();
}

function stamp(when: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}` +
    `-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`
  );
}

/**
 * Drive 保存用のファイル名を生成する。
 * 例: 駅前校_山田太郎_20260714-091530.pdf
 */
export function buildDriveFileName(
  campus: string,
  studentName: string | null,
  mime: string,
  when: Date,
): string {
  const name = sanitize(studentName ?? "") || "氏名未取得";
  return `${sanitize(campus) || "校舎未設定"}_${name}_${stamp(when)}.${extForMime(mime)}`;
}
