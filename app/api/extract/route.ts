import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ExtractRequest } from "@/lib/types";

// Anthropic SDK は Node.js ランタイムで実行する必要があります。
export const runtime = "nodejs";
// 画像解析はやや時間がかかるため、実行時間を延長します（ホスティング側が対応する場合）。
export const maxDuration = 60;

const client = new Anthropic();

// Claude に返してほしい構造を Zod で定義します。
// 評定は 10 科目の固定フィールド。読み取れない科目は null を許容します。
const RatingsSchema = z.object({
  kokugo: z.string().nullable().describe("国語の評定。無ければ null"),
  eigo: z
    .string()
    .nullable()
    .describe("英語（外国語・外国語（英語）含む）の評定。無ければ null"),
  sugaku: z.string().nullable().describe("数学（算数）の評定。無ければ null"),
  rika: z.string().nullable().describe("理科の評定。無ければ null"),
  shakai: z
    .string()
    .nullable()
    .describe("社会（地理・歴史・公民含む）の評定。無ければ null"),
  ongaku: z.string().nullable().describe("音楽の評定。無ければ null"),
  bijutsu: z
    .string()
    .nullable()
    .describe("美術（図画工作・図工含む）の評定。無ければ null"),
  hotai: z
    .string()
    .nullable()
    .describe("保健体育（体育・保健含む）の評定。無ければ null"),
  kateika: z
    .string()
    .nullable()
    .describe("家庭科（技術・家庭の家庭分野含む）の評定。無ければ null"),
  gijutsu: z
    .string()
    .nullable()
    .describe("技術（技術・家庭の技術分野含む）の評定。無ければ null"),
});

const ReportCardSchema = z.object({
  studentName: z.string().nullable().describe("児童・生徒の氏名。読み取れなければ null"),
  schoolYear: z
    .string()
    .nullable()
    .describe('学年。例: "中学2年", "小学5年"。読み取れなければ null'),
  term: z
    .string()
    .nullable()
    .describe('学期・期間。例: "1学期", "前期", "学年末"。読み取れなければ null'),
  ratings: RatingsSchema.describe(
    "10 科目の評定。読み取れた科目だけ値を入れ、それ以外は必ず null",
  ),
});

const PROMPT = `あなたは日本の学校の通知表（通信簿）を読み取る専門家です。
添付された通知表の画像または PDF から、各教科の「評定（成績）」を読み取り、決められた 10 科目の枠に振り分けてください。

10 科目（出力キー → 対応する通知表の科目名）:
- kokugo  … 国語
- eigo    … 英語 / 外国語 / 外国語（英語）
- sugaku  … 数学 / 算数
- rika    … 理科
- shakai  … 社会 / 地理 / 歴史 / 公民
- ongaku  … 音楽
- bijutsu … 美術 / 図画工作 / 図工
- hotai   … 保健体育 / 体育 / 保健
- kateika … 家庭科 / 技術・家庭の「家庭分野」
- gijutsu … 技術 / 技術・家庭の「技術分野」

ルール:
- 各科目の「評定」をそのまま読み取ること（多くは 1〜5 の数値。A/B/C などの記号や文章の場合はその表記のまま）。
- 「観点別評価」と「評定」が別々にある場合は、総合的な「評定」の方を採用すること。
- 通知表に存在しない科目、または読み取れない科目は必ず null にすること（推測で値を入れない）。
- 「技術・家庭」が 1 つの評定でまとめられている場合は、その値を gijutsu と kateika の両方に入れること。技術分野・家庭分野で別々の評定がある場合はそれぞれに入れること。
- 氏名・学年・学期が読み取れる場合は記録し、読み取れない場合は null にすること。`;

type ImageMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
type SupportedMedia = ImageMedia | "application/pdf";

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "サーバーに ANTHROPIC_API_KEY が設定されていません。" },
      { status: 500 },
    );
  }

  let body: Partial<ExtractRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const { image, mediaType } = body;
  if (!image || !mediaType) {
    return NextResponse.json(
      { error: "画像データ（image, mediaType）が必要です。" },
      { status: 400 },
    );
  }

  const allowed: SupportedMedia[] = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ];
  if (!allowed.includes(mediaType as SupportedMedia)) {
    return NextResponse.json(
      { error: `対応していない形式です: ${mediaType}` },
      { status: 400 },
    );
  }

  const mt = mediaType as SupportedMedia;
  // 画像は image ブロック、PDF は document ブロックとして送る
  const sourceBlock: Anthropic.Beta.Messages.BetaContentBlockParam =
    mt === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: image },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mt, data: image },
        };

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      output_format: betaZodOutputFormat(ReportCardSchema),
      messages: [
        {
          role: "user",
          content: [sourceBlock, { type: "text", text: PROMPT }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "この画像の解析は安全上の理由で拒否されました。" },
        { status: 422 },
      );
    }

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "評定を抽出できませんでした。別の写真でお試しください。" },
        { status: 422 },
      );
    }

    return NextResponse.json(response.parsed_output);
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Claude API エラー (${err.status}): ${err.message}`
        : "解析中に予期しないエラーが発生しました。";
    console.error("extract error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
