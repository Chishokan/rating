import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";

// Anthropic SDK は Node.js ランタイムで実行する必要があります。
export const runtime = "nodejs";
// 画像解析はやや時間がかかるため、実行時間を延長します（ホスティング側が対応する場合）。
export const maxDuration = 60;

const client = new Anthropic();

// Claude に返してほしい構造を Zod で定義します。
// 読み取れない項目は null を許容します。
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
  subjects: z
    .array(
      z.object({
        subject: z.string().describe("科目名。例: 国語, 数学, 英語"),
        rating: z
          .string()
          .describe("評定。通知表の記載どおり。例: 5, A, よくできる"),
      }),
    )
    .describe("科目ごとの評定の一覧"),
});

const PROMPT = `あなたは日本の学校の通知表（通信簿）を読み取る専門家です。
添付された通知表の写真から、各教科・科目の「評定（成績）」を正確に抽出してください。

ルール:
- 科目名と評定をそのまま読み取ること。評定は数値（例: 5, 4, 3）でも記号（例: A, B, C）でも、文章（例: よくできる）でも、通知表に書かれた表記のまま記録すること。
- 「観点別評価」と「評定」が別々にある場合は、総合的な「評定」の方を優先して subjects に入れること。
- 氏名・学年・学期が読み取れる場合は記録し、読み取れない場合は null にすること。
- 表に存在しない科目を創作しないこと。読み取れた科目だけを返すこと。`;

type SupportedMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "サーバーに ANTHROPIC_API_KEY が設定されていません。" },
      { status: 500 },
    );
  }

  let body: { image?: string; mediaType?: string };
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
  ];
  if (!allowed.includes(mediaType as SupportedMedia)) {
    return NextResponse.json(
      { error: `対応していない画像形式です: ${mediaType}` },
      { status: 400 },
    );
  }

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      output_format: betaZodOutputFormat(ReportCardSchema),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as SupportedMedia,
                data: image,
              },
            },
            { type: "text", text: PROMPT },
          ],
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
