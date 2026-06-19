# 通知表 評定集計アプリ

通知表（通信簿）の写真を撮ると、**Claude Vision API** が科目ごとの評定（成績）を自動で読み取り、
管理画面で集計・確認して **CSV** に書き出せる Web アプリです。

## 主な機能

- 📷 **撮影 / アップロード** — スマホのカメラやファイルから通知表の画像を取り込み
- 🤖 **AI 読み取り** — Claude（`claude-opus-4-8`）が科目名・評定・氏名・学年・学期を抽出
- ✏️ **確認・修正** — 読み取り結果を保存前にその場で編集
- 📊 **集計画面** — 登録枚数・科目数・数値評定の平均・評定の分布を表示
- ⬇️ **CSV 出力** — Excel / Google スプレッドシートで開ける UTF-8 (BOM 付き) CSV

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

集計・CSV出力の純粋ロジックにはユニットテストがあります（Node 22 のネイティブ TypeScript 実行を利用）。

```bash
npm test
```

ビルドと型チェック:

```bash
npm run build      # 本番ビルド
npx tsc --noEmit   # 型チェックのみ
```

## Vercel へのデプロイ

このアプリは Vercel にそのままデプロイできます。

1. [Vercel](https://vercel.com/new) で **Add New → Project** を開く
2. GitHub リポジトリ `Chishokan/rating` をインポート
   （ブランチは `claude/sweet-faraday-52cecc`、または `main` にマージ後）
3. Framework Preset は **Next.js**（自動検出）
4. **Environment Variables** に以下を追加:
   - `ANTHROPIC_API_KEY` = 自分の Claude API キー
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
4. **集計・CSV** ページで一覧と集計を確認し、CSV をダウンロード

## 構成

```
app/
  page.tsx              撮影・読み取り・登録ページ
  dashboard/page.tsx    集計・CSV出力ページ
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
