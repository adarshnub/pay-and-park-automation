import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { logOcrInferenceUsage } from "@/src/lib/ocr/inference-logger";
import { fetchOrgOcrDetectionMode } from "@/src/lib/ocr/fetch-org-detection-mode";
import { runServerOcrPipeline } from "@/src/lib/ocr/server-ocr-pipeline";
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
    const detectionMode = await fetchOrgOcrDetectionMode(ctx.link.organization_id);
    const imageBytes = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || "image/jpeg";
    return runServerOcrPipeline({
      imageBytes,
      mimeType,
      logLabel: "api/shared-lot/process-image",
      detectionMode,
      onInferenceUsage: (tokenUsage) =>
        logOcrInferenceUsage({
          organizationId: ctx.link.organization_id,
          parkingLotId: ctx.lot.id,
          source: "shared_lot",
          tokenUsage,
        }),
    });
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  return NextResponse.json(gated.data);
}
