/**
 * Test-state seeding helpers for the local E2E user.
 *
 * The E2E user is shared across runs and workers, so anything tests rely on
 * (api_keys, default_model, prompts) must be reset to a known state — otherwise
 * earlier sessions / UI-mode iterations leave drift that surfaces as flake.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { webcrypto } from "node:crypto";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// ENCRYPTION_KEY from .dev.vars — matches the algorithm in src/lib/services/api-key-crypto.ts.
const ENCRYPTION_KEY_B64 = "9mb8AMNKb/cbcrg7PypOuRxikCwL2vcDQ7keOIdcV14=";
const HKDF_INFO = "f02-api-keys-v1";

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptForUser(plaintext: string, userId: string) {
  const subtle = webcrypto.subtle as SubtleCrypto;
  const raw = base64ToBytes(ENCRYPTION_KEY_B64).buffer as ArrayBuffer;
  const masterKey = await subtle.importKey("raw", raw, { name: "HKDF" }, false, ["deriveKey"]);
  const userKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(userId),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  webcrypto.getRandomValues(iv);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, userKey, new TextEncoder().encode(plaintext));
  return { v: 1, alg: "aes-256-gcm", iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

export function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export async function resolveUserId(adminClient: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await adminClient.auth.admin.listUsers();
  return data.users.find((u) => u.email === email)?.id ?? null;
}

/**
 * Reset user_settings to a known state: OpenAI key seeded, no default_model.
 * The form picks the first model whose provider has a key — guaranteed OpenAI here.
 */
export async function resetUserSettingsForE2e(email: string): Promise<void> {
  const adminClient = createAdminClient();
  const userId = await resolveUserId(adminClient, email);
  if (!userId) return;

  const blob = await encryptForUser("sk-e2e-fake-key", userId);
  await adminClient
    .from("user_settings")
    .update({ api_keys: { openai: blob }, default_model: null })
    .eq("user_id", userId);
}
