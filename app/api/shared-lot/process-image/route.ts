import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { processWithOpenAI, processWithTesseract } from "@/src/lib/ocr/pipeline";
import { touchLinkLastUsed } from "@/src/lib/shared-lot/service";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const formData = await request.formData();
  const token = formData.get("token") as string | null;
  const imageFile = formData.get("image") as File | null;

  if (!imageFile) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const gated = await withSharedLotToken(request, token ?? undefined, async (ctx) => {
    await touchLinkLastUsed(ctx.link.id);
    const imageBytes = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || "image/jpeg";

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const result = await processWithOpenAI(imageBytes, mimeType, openaiKey, "gpt-4o-mini");
        if (result.plate) return result;
      } catch {
        /* fall through */
      }
    }

    return processWithTesseract(imageBytes);
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  return NextResponse.json(gated.data);
}
