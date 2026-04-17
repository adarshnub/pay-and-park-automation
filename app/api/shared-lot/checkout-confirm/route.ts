import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { publicCheckoutConfirm, touchLinkLastUsed } from "@/src/lib/shared-lot/service";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let token: string;
  let visitId: string;
  let plate: string;
  let rawDetectedPlate: string | null = null;
  let confidence: number | null = null;
  let wasManuallyEdited = false;
  try {
    const body = await request.json();
    token = body.token;
    visitId = body.visitId;
    plate = body.plate;
    rawDetectedPlate = body.rawDetectedPlate ?? null;
    confidence = body.confidence != null ? Number(body.confidence) : null;
    wasManuallyEdited = Boolean(body.wasManuallyEdited);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!visitId || !plate?.trim()) {
    return NextResponse.json({ error: "visitId and plate required" }, { status: 400 });
  }

  const gated = await withSharedLotToken(request, token, async (ctx) => {
    await touchLinkLastUsed(ctx.link.id);
    return publicCheckoutConfirm({
      organizationId: ctx.link.organization_id,
      parkingLotId: ctx.lot.id,
      visitId,
      plate,
      rawDetectedPlate,
      confidence,
      wasManuallyEdited,
    });
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  const result = gated.data;
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({
    success: true,
    invoiceId: result.invoiceId,
    receiptNumber: result.receiptNumber,
  });
}
