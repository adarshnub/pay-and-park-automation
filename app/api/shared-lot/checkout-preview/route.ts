import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { publicCheckoutPreview, touchLinkLastUsed } from "@/src/lib/shared-lot/service";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let token: string;
  let plate: string;
  try {
    const body = await request.json();
    token = body.token;
    plate = body.plate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!plate?.trim()) {
    return NextResponse.json({ error: "Plate required" }, { status: 400 });
  }

  const gated = await withSharedLotToken(request, token, async (ctx) => {
    await touchLinkLastUsed(ctx.link.id);
    return publicCheckoutPreview({
      organizationId: ctx.link.organization_id,
      parkingLotId: ctx.lot.id,
      plate,
    });
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  const result = gated.data;
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ visit: result.visit });
}
