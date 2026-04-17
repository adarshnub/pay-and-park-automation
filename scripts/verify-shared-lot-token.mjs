#!/usr/bin/env node
/**
 * Sanity check for share token hashing (no TS runner required).
 * Run: node scripts/verify-shared-lot-token.mjs
 */
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

function hashShareToken(raw) {
  return createHash("sha256").update(raw.trim(), "utf8").digest("hex");
}

assert.equal(hashShareToken("  abc  "), hashShareToken("abc"));
assert.notEqual(hashShareToken("a"), hashShareToken("b"));
assert.equal(hashShareToken("x").length, 64);
console.log("shared-lot token hash checks: ok");
