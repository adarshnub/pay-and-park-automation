import type { NextRequest } from "next/server";
import { checkSharedLotRateLimit, rateLimitKey } from "./rate-limit";
import { hashShareToken } from "./token";
import { resolveShareToken } from "./service";
import type { ResolvedShareContext } from "./service";

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export async function withSharedLotToken<T>(
  request: NextRequest,
  rawToken: string | undefined,
  handler: (ctx: ResolvedShareContext) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: unknown }> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return { ok: false, status: 400, body: { error: "Invalid token" } };
  }

  const ip = getClientIp(request);
  const rlKey = rateLimitKey(ip, hashShareToken(rawToken).slice(0, 16));
  if (!checkSharedLotRateLimit(rlKey)) {
    return { ok: false, status: 429, body: { error: "Too many requests. Try again shortly." } };
  }

  const ctx = await resolveShareToken(rawToken);
  if (!ctx) {
    return { ok: false, status: 404, body: { error: "Invalid or expired link" } };
  }

  const data = await handler(ctx);
  return { ok: true, data };
}
