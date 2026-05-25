// Fails the commit if wrangler.jsonc contains a secret-shaped value.
// Patterns flagged:
//   - JWT-shaped strings (eyJ... three base64url segments)
//   - SUPABASE_KEY value embedded as a literal
//   - top-level `vars` block with secret-shaped keys (we use `wrangler secret put`)
import { readFileSync, existsSync } from "node:fs";

const path = "wrangler.jsonc";
if (!existsSync(path)) process.exit(0);
const src = readFileSync(path, "utf8");

const failures = [];
if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(src)) {
  failures.push("JWT-shaped string found in wrangler.jsonc — use `wrangler secret put`.");
}
if (/SUPABASE_KEY\s*[:=]\s*["'][^"']+["']/.test(src)) {
  failures.push("SUPABASE_KEY value found in wrangler.jsonc — use `wrangler secret put`.");
}
if (/"vars"\s*:\s*\{[^}]*(?:KEY|SECRET|TOKEN)[^}]*\}/i.test(src)) {
  failures.push("`vars` block in wrangler.jsonc contains secret-shaped key — move to `wrangler secret put`.");
}
if (failures.length) {
  console.error("[pre-commit] wrangler.jsonc secrets-leak guard failed:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
