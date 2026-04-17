/**
 * Base URL for absolute staff share links (`/s/...`).
 *
 * Order:
 * 1. `NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL` — use when it should differ from other app URL uses
 * 2. `NEXT_PUBLIC_APP_URL` — general public app origin
 *
 * Does not use `VERCEL_URL`: it often points at a deployment hostname, not your public or custom domain.
 */
export function getShareableLinkBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) return app.replace(/\/$/, "");

  return "";
}
