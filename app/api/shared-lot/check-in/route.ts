import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { publicCheckIn, touchLinkLastUsed } from "@/src/lib/shared-lot/service";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let token: string;
  let plate: string;
  let rawDetectedPlate: string | null = null;
  let confidence: number | null = null;
  let wasManuallyEdited = false;
  try {
    const body = await request.json();
    token = body.token;
    plate = body.plate;
    rawDetectedPlate = body.rawDetectedPlate ?? null;
    confidence = body.confidence != null ? Number(body.confidence) : null;
    wasManuallyEdited = Boolean(body.wasManuallyEdited);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!plate?.trim()) {
    return NextResponse.json({ error: "Plate required" }, { status: 400 });
  }

  const gated = await withSharedLotToken(request, token, async (ctx) => {
    await touchLinkLastUsed(ctx.link.id);
    return publicCheckIn({
      organizationId: ctx.link.organization_id,
      parkingLotId: ctx.lot.id,
      plate,
      rawDetectedPlate,
      confidence,
      wasManuallyEdited,
    });
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  const result = gated.data;
  if (!result.success) {
    if (result.code === "CHECKED_IN_ELSEWHERE") {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          conflictingVisitId: result.conflictingVisitId,
          otherParkingLotId: result.otherParkingLotId,
          otherParkingLotName: result.otherParkingLotName,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true, visitId: result.visitId });
}
