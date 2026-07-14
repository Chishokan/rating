# 通知表 評定集計アプリ

通知表（通信簿）の写真を撮ると、**Claude Vision API** が科目ごとの評定（成績）を自動で読み取り、
管理画面で校舎ごとに集計・確認し、Google スプレッドシートへ自動記録できる Web アプリです。

## 主な機能

- 📷 **撮影 / アップロード** — スマホのカメラやファイルから通知表の画像・PDFを取り込み（複数まとめて可）
- 📄 **複数ページ PDF 対応** — 複数ページの PDF はブラウザ上で自動的に 1 ページずつ分割し、各ページを 1 通知表として解析
- ⚡ **並列解析** — 複数ファイルを最大 4 並列で高速に解析（429 時は自動リトライ）
- 🏫 **校舎別管理** — 駅前校 / 日宇校 / 大野校 / 日野校 を選んで登録、校舎で絞り込み集計
- 🤖 **AI 読み取り** — Claude（`claude-opus-4-8`）が 10 科目の評定・氏名・学年・学期を抽出
- ✏️ **確認・修正** — 読み取り結果を保存前にその場で編集
- 📊 **集計画面** — 登録枚数・科目数・数値評定の平均・評定の分布を表示
- 📝 **GAS スプレッドシート連携（任意）** — 保存時に Google スプレッドシートへ 1 行 = 1 通知表 で自動追記
- ❓ **使い方タブ** — アプリ内に操作手順ガイドを用意

データはサーバーに保存されず、利用端末のブラウザ内（`localStorage`）にのみ保持されます。

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

集計ロジックのユニットテストがあります（tsx で TypeScript を実行）。

```bash
npm test
```

ビルドと型チェック:

```bash
npm run build      # 本番ビルド
npx tsc --noEmit   # 型チェックのみ
```

## Google スプレッドシートへのログ連携（任意）

保存した通知表データを Google スプレッドシートに自動追記できます（Google Apps Script 経由。OAuth 設定不要）。

1. ログを記録したい Google スプレッドシートを開く
2. **拡張機能 → Apps Script** を開き、`gas/Code.gs` の内容を貼り付けて保存
3. **デプロイ → 新しいデプロイ → ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
4. 発行された **ウェブアプリの URL** をコピー
5. 環境変数 `GAS_LOG_URL` にその URL を設定（ローカルは `.env.local`、本番は Vercel の環境変数）

設定後、アプリで通知表を保存すると「ログ」シートに `日時 / 校舎 / ファイル名 / 氏名 / 学年 / 学期 / 10科目` が 1 行ずつ追記されます。未設定でもアプリは通常どおり動作し、ログ記録のみスキップされます。

## Vercel へのデプロイ

このアプリは Vercel にそのままデプロイできます。

1. [Vercel](https://vercel.com/new) で **Add New → Project** を開く
2. GitHub リポジトリ `Chishokan/rating` をインポート
   （ブランチは `claude/sweet-faraday-52cecc`、または `main` にマージ後）
3. Framework Preset は **Next.js**（自動検出）
4. **Environment Variables** に以下を追加:
   - `ANTHROPIC_API_KEY` = 自分の Claude API キー（必須）
   - `GAS_LOG_URL` = GAS ウェブアプリの URL（任意・スプレッドシート連携する場合）
5. **Deploy** を押す

補足:
- API ルート（`app/api/extract/route.ts`）は Node.js ランタイムで動作し、
  `export const maxDuration = 60` で関数の実行時間を最大60秒に設定済みです。
- ビルド時に API キーは不要です（キーはリクエスト時にのみ読み込まれます）。
  キー未設定でもデプロイは成功し、解析実行時のみ 500 を返します。
- デプロイ後、実機（スマホ）で通知表を撮影して評定の読み取り精度を確認してください。

## 使い方

1. **撮影・登録** ページで通知表の写真を選択／撮影
2. 「評定を読み取る」を押すと AI が解析
3. 結果を確認・修正して「保存」
4. **集計** ページで校舎ごとに一覧と集計を確認（保存時にスプレッドシートへも自動記録）

## 構成

```
app/
  page.tsx              撮影・読み取り・登録ページ
  dashboard/page.tsx    集計ページ
  guide/page.tsx        使い方ページ
  api/extract/route.ts  画像→評定 を抽出する API（Claude Vision）
  layout.tsx, globals.css
lib/
  types.ts              共有の型定義
  storage.ts            localStorage 操作
```

## 注意事項

- 解析は AI による推定のため、**保存前に必ず内容を確認**してください。
- 画像はクライアント側で最大辺 1800px に縮小してから送信します（精度とコストの両立）。
- API 利用には Anthropic の課金が発生します。
