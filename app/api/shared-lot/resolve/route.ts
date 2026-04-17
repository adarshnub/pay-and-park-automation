import { NextRequest, NextResponse } from "next/server";
import { withSharedLotToken } from "@/src/lib/shared-lot/api-helpers";
import { fetchLotStats, getServiceSupabase, touchLinkLastUsed } from "@/src/lib/shared-lot/service";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let token: string;
  try {
    const body = await request.json();
    token = body.token;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gated = await withSharedLotToken(request, token, async (ctx) => {
    const supabase = await getServiceSupabase();
    const stats = await fetchLotStats(supabase, ctx.lot.id, ctx.lot.total_capacity);
    await touchLinkLastUsed(ctx.link.id);
    return {
      linkName: ctx.link.name,
      lot: {
        id: ctx.lot.id,
        name: ctx.lot.name,
        address: ctx.lot.address,
        total_capacity: ctx.lot.total_capacity,
      },
      stats,
    };
  });

  if (!gated.ok) return NextResponse.json(gated.body, { status: gated.status });
  return NextResponse.json(gated.data);
}
