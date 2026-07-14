/**
 * 通知表 評定集計アプリ — ログ受信用 Google Apps Script
 *
 * ■ 使い方
 * 1. ログを記録したい Google スプレッドシートを開く
 * 2. 拡張機能 → Apps Script を開き、このコードを貼り付けて保存
 * 3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 説明: 任意
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 4. 発行された「ウェブアプリの URL」をコピー
 * 5. Vercel（またはローカル .env.local）の環境変数 GAS_LOG_URL に設定
 *
 * アプリで通知表を保存すると、このスクリプトが「ログ」シートに
 * 1 行 = 1 通知表 で追記します（10 科目の評定つき）。
 */

// 追記先シート名
var SHEET_NAME = "ログ";

// 10 科目のキーと見出し（アプリ側の並びと一致させる）
var SUBJECT_KEYS = [
  "kokugo", "eigo", "sugaku", "rika", "shakai",
  "ongaku", "bijutsu", "hotai", "kateika", "gijutsu",
];
var SUBJECT_LABELS = [
  "国語", "英語", "数学", "理科", "社会",
  "音楽", "美術", "保体", "家庭科", "技術",
];
var HEADER = ["日時", "校舎", "ファイル名", "氏名", "学年", "学期"].concat(SUBJECT_LABELS);

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 同時追記の競合を防ぐ

    var body = JSON.parse(e.postData.contents);
    var rows = body.rows || [];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER);
      sheet.setFrozenRows(1);
    }

    rows.forEach(function (r) {
      var ratings = r.ratings || {};
      var row = [
        r.savedAt || new Date().toISOString(),
        r.campus || "",
        r.fileName || "",
        r.studentName || "",
        r.schoolYear || "",
        r.term || "",
      ].concat(
        SUBJECT_KEYS.map(function (k) {
          return ratings[k] == null ? "" : ratings[k];
        }),
      );
      sheet.appendRow(row);
    });

    return json({ ok: true, added: rows.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 動作確認用（ブラウザで URL を開くと OK が返る）
function doGet() {
  return json({ ok: true, message: "通知表ログ受信エンドポイント" });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
