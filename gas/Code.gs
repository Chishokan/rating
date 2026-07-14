/**
 * 通知表 評定集計アプリ — スプレッドシート記録＋Drive保存用 Google Apps Script
 *
 * ■ できること
 *  - 保存した通知表データを「ログ」シートに 1 行 = 1 通知表 で追記
 *  - 元ファイル（画像/PDF）を指定の Google Drive フォルダに保存
 *
 * ■ 使い方
 * 1. 記録先の Google スプレッドシートを開く
 * 2. 拡張機能 → Apps Script を開き、このコードを貼り付けて保存
 * 3. 下の DRIVE_FOLDER_ID を、保存先フォルダの ID に設定
 *    （フォルダ URL の /folders/ の後ろの文字列。空にすると Drive 保存は無効）
 * 4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 *    ※ 初回は Drive/スプレッドシートへのアクセス許可を求められます
 * 5. 発行された「ウェブアプリの URL」を Vercel などの環境変数 GAS_LOG_URL に設定
 *
 * ※ このスクリプトを実行する Google アカウントが、対象フォルダに
 *    「編集者」権限を持っている必要があります。
 */

// 保存先の Drive フォルダ ID（空文字にすると Drive 保存は行わない）
var DRIVE_FOLDER_ID = "1tWLz9gO0sGWyVzaGSWi009ukcV3aBs8Z";

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

    // {rows:[...]}（複数・ファイルなし）と {row:..., file:...}（単件）の両方を受ける
    var entries = [];
    if (body.rows) {
      entries = body.rows.map(function (r) { return { row: r }; });
    } else if (body.row) {
      entries = [{ row: body.row, file: body.file }];
    }

    var sheet = getSheet();
    var results = [];
    entries.forEach(function (entry) {
      appendRow(sheet, entry.row);
      var driveResult = "";
      if (entry.file && entry.file.base64 && DRIVE_FOLDER_ID) {
        driveResult = saveToDrive(entry.file);
      }
      results.push(driveResult);
    });

    return json({ ok: true, added: entries.length, drive: results });
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

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRow(sheet, r) {
  r = r || {};
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
}

// 元ファイルを Drive フォルダへ保存。結果文字列（"ok" または "error:..."）を返す
function saveToDrive(file) {
  try {
    var bytes = Utilities.base64Decode(file.base64);
    var blob = Utilities.newBlob(
      bytes,
      file.mimeType || "application/octet-stream",
      file.name || "report",
    );
    DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
    return "ok";
  } catch (err) {
    return "error:" + String(err);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
