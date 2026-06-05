import { ENCRYPTION_KEY } from "astro:env/server";

export interface EncryptedBlob {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  ct: string;
}

const HKDF_INFO = "f02-api-keys-v1";
const IV_BYTE_LENGTH = 12;
const MASTER_KEY_BYTE_LENGTH = 32;

export function isEncryptionConfigured(): boolean {
  return typeof ENCRYPTION_KEY === "string" && ENCRYPTION_KEY.length > 0;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
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

function userIdToSalt(userId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(userId);
}

async function importMasterKey(): Promise<CryptoKey> {
  const masterKey = ENCRYPTION_KEY;
  if (typeof masterKey !== "string" || masterKey.length === 0) {
    throw new Error("encryption_key_missing");
  }
  const raw = base64ToBytes(masterKey);
  if (raw.byteLength !== MASTER_KEY_BYTE_LENGTH) {
    throw new Error("encryption_key_missing");
  }
  return crypto.subtle.importKey("raw", raw, { name: "HKDF" }, false, ["deriveKey"]);
}

async function deriveUserKey(userId: string): Promise<CryptoKey> {
  const masterKey = await importMasterKey();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: userIdToSalt(userId),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptApiKey(plaintext: string, userId: string): Promise<EncryptedBlob> {
  const key = await deriveUserKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const ctBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ctBuffer)),
  };
}

export async function decryptApiKey(blob: EncryptedBlob, userId: string): Promise<string> {
  const key = await deriveUserKey(userId);
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ct);
  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  } catch {
    throw new Error("decrypt_failed");
  }
  return new TextDecoder().decode(plainBuffer);
}
