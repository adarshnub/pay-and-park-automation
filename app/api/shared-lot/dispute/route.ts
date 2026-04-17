import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { publicSubmitCheckInDispute, touchLinkLastUsed } from "@/src/lib/shared-lot/service";
import { normalizePlate } from "@/src/lib/plate";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let token: string;
  let plate: string;
  let conflictingVisitId: string;
  let note: string | null = null;
  try {
    const body = await request.json();
    token = body.token;
    plate = body.plate;
    conflictingVisitId = body.conflictingVisitId;
    note = body.note != null ? String(body.note) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!plate?.trim() || !conflictingVisitId) {
    return NextResponse.json({ error: "plate and conflictingVisitId required" }, { status: 400 });
  }

  const gated = await withSharedLotToken(request, token, async (ctx) => {
    await touchLinkLastUsed(ctx.link.id);
    return publicSubmitCheckInDispute({
      organizationId: ctx.link.organization_id,
      intendedParkingLotId: ctx.lot.id,
      conflictingVisitId,
      normalizedPlate: normalizePlate(plate),
      employeeNote: note,
      lotSharedLinkId: ctx.link.id,
    });
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  const result = gated.data;
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, disputeId: result.disputeId });
}
