# 通知表 評定集計アプリ

通知表（通信簿）の写真・PDF を取り込むと、**Claude Vision API** が科目ごとの評定（成績）を自動で読み取り、
**Google スプレッドシートへの記録**と**指定 Drive フォルダへのファイル保存**を行う Web アプリです。

## 主な機能

- 📷 **撮影 / アップロード** — スマホのカメラやファイルから通知表の画像・PDFを取り込み（複数まとめて可・枚数制限なし）
- 📄 **複数ページ PDF 対応** — 複数ページの PDF はブラウザ上で自動的に 1 ページずつ分割し、各ページを 1 通知表として解析
- ⚡ **並列解析** — 複数ファイルを最大 6 並列で高速に解析（429 時は自動リトライ）
- 🏫 **校舎別管理** — 駅前校 / 日宇校 / 大野校 / 日野校 を選んで登録
- 🤖 **AI 読み取り** — Claude（`claude-opus-4-8`）が 10 科目の評定・氏名・学年・学期を抽出
- ✏️ **確認・修正** — 読み取り結果を保存前にその場で編集
- 📝 **スプレッドシート記録＋Drive 保存** — 保存時に GAS 経由で、評定を Google スプレッドシートに 1 行 = 1 通知表 で追記し、元ファイルを指定 Drive フォルダに保存
- 🔒 **プライバシー配慮** — アプリ内にデータ一覧を持たず、利用者は自分がアップロードした分だけを扱う
- ❓ **使い方タブ** — アプリ内に操作手順ガイドを用意

抽出データと元ファイルの保存先は Google スプレッドシート／Drive です（GAS 連携）。アプリ自体は端末内にデータ一覧を保持しません。

## 技術スタック

- [Next.js 14](https://nextjs.org/)（App Router）/ React / TypeScript
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)（Claude Vision + 構造化出力）

## セットアップ

```bash
# 1. 依存関係をインストール
npm install

# 2. API キーを設定
cp .env.example .env.local
#   .env.local を開き ANTHROPIC_API_KEY に自分のキーを設定

# 3. 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

## テスト

純粋ロジック（Drive 保存用ファイル名の生成など）のユニットテストがあります（tsx で TypeScript を実行）。

```bash
npm test
```

ビルドと型チェック:

```bash
npm run build      # 本番ビルド
npx tsc --noEmit   # 型チェックのみ
```

## スプレッドシート記録＋Drive 保存の連携（GAS）

保存先は Google Apps Script（GAS）で用意します。GAS はスプレッドシート所有者の権限で動くため、**OAuth 設定不要**で Drive フォルダにもファイルを保存できます。

1. 記録先の Google スプレッドシートを開く
2. **拡張機能 → Apps Script** を開き、`gas/Code.gs` の内容を貼り付け
3. スクリプト内の `DRIVE_FOLDER_ID` を、保存先 Drive フォルダの ID に設定
   （フォルダ URL の `/folders/` の後ろの文字列。空にすると Drive 保存は無効）
   - このスクリプトを実行する Google アカウントが、対象フォルダに **編集者** 権限を持っている必要があります
4. **デプロイ → 新しいデプロイ → ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
   - 初回は Drive／スプレッドシートへのアクセス許可を求められます
5. 発行された **ウェブアプリの URL** を環境変数 `GAS_LOG_URL` に設定（ローカルは `.env.local`、本番は Vercel）

設定後、通知表を保存すると「ログ」シートに `日時 / 校舎 / ファイル名 / 氏名 / 学年 / 学期 / 10科目` が 1 行ずつ追記され、元ファイル（画像・PDF）が指定 Drive フォルダに保存されます。`GAS_LOG_URL` 未設定の場合、保存は行われずアプリが警告を表示します。

## Vercel へのデプロイ

このアプリは Vercel にそのままデプロイできます。

1. [Vercel](https://vercel.com/new) で **Add New → Project** を開く
2. GitHub リポジトリ `Chishokan/rating` をインポート
   （ブランチは `claude/sweet-faraday-52cecc`、または `main` にマージ後）
3. Framework Preset は **Next.js**（自動検出）
4. **Environment Variables** に以下を追加:
   - `ANTHROPIC_API_KEY` = 自分の Claude API キー（必須）
   - `GAS_LOG_URL` = GAS ウェブアプリの URL（保存先。スプレッドシート＋Drive 連携に必須）
5. **Deploy** を押す

補足:
- API ルート（`app/api/extract/route.ts`）は Node.js ランタイムで動作し、
  `export const maxDuration = 60` で関数の実行時間を最大60秒に設定済みです。
- ビルド時に API キーは不要です（キーはリクエスト時にのみ読み込まれます）。
  キー未設定でもデプロイは成功し、解析実行時のみ 500 を返します。
- デプロイ後、実機（スマホ）で通知表を撮影して評定の読み取り精度を確認してください。

## 使い方

1. **撮影・登録** ページで校舎を選ぶ
2. 通知表の画像・PDF を選択（複数可・複数ページPDF可）
3. 「すべて解析」で AI が読み取り
4. 結果を確認・修正して「保存」（スプレッドシートへ記録＋Drive へファイル保存）

アプリ内の **使い方** タブにも操作手順があります。

## 構成

```
app/
  page.tsx              撮影・読み取り・保存ページ
  guide/page.tsx        使い方ページ
  api/extract/route.ts  画像/PDF→評定 を抽出する API（Claude Vision）
  api/log/route.ts      GAS へ保存データ・ファイルを転送する API
  layout.tsx, globals.css
lib/
  types.ts              共有の型定義
  subjects.ts           10科目の定義
  campuses.ts           校舎の定義
  filename.ts           Drive 保存用ファイル名の生成
gas/
  Code.gs               スプレッドシート追記＋Drive保存の GAS
```

## 注意事項

- 解析は AI による推定のため、**保存前に必ず内容を確認**してください。
- 画像はクライアント側で最大辺 1800px に縮小してから送信します（精度とコストの両立）。
- API 利用には Anthropic の課金が発生します。
