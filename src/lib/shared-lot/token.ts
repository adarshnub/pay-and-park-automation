import crypto from "crypto";

export function hashShareToken(raw: string): string {
  return crypto.createHash("sha256").update(raw.trim(), "utf8").digest("hex");
}

/** URL-safe high-entropy token; store only hash in DB. */
export function generateShareToken(): { raw: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = hashShareToken(raw);
  const prefix = raw.slice(0, 8);
  return { raw, hash, prefix };
}
