// One-shot manual probe: prove the api-key-crypto contract holds end-to-end.
// Re-implements the documented algorithm (HKDF-SHA-256 → AES-256-GCM, info='f02-api-keys-v1',
// salt = utf8(userId), 12-byte random IV) against Node's Web Crypto, reads ENCRYPTION_KEY from
// .dev.vars (no dotenv dep), and asserts decrypt(encrypt(plaintext)) === plaintext.
import { readFileSync, existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";

/** @type {Crypto} */
const subtleCrypto = webcrypto;

const HKDF_INFO = "f02-api-keys-v1";
const IV_BYTE_LENGTH = 12;
const MASTER_KEY_BYTE_LENGTH = 32;

/** @returns {string | null} */
function readDevVar(/** @type {string} */ name) {
  if (!existsSync(".dev.vars")) {
    console.error("[roundtrip] .dev.vars not found at repo root");
    process.exit(1);
  }
  const src = readFileSync(".dev.vars", "utf8");
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    if (k !== name) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

function base64ToBytes(/** @type {string} */ b64) {
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function deriveUserKey(/** @type {Uint8Array} */ masterKeyBytes, /** @type {string} */ userId) {
  const masterKey = await subtleCrypto.subtle.importKey("raw", masterKeyBytes, { name: "HKDF" }, false, ["deriveKey"]);
  return subtleCrypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(userId),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptApiKey(
  /** @type {string} */ plaintext,
  /** @type {string} */ userId,
  /** @type {Uint8Array} */ masterKeyBytes,
) {
  const key = await deriveUserKey(masterKeyBytes, userId);
  const iv = subtleCrypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const ctBuffer = await subtleCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: Buffer.from(iv).toString("base64"),
    ct: Buffer.from(new Uint8Array(ctBuffer)).toString("base64"),
  };
}

async function decryptApiKey(
  /** @type {{ iv: string, ct: string }} */ blob,
  /** @type {string} */ userId,
  /** @type {Uint8Array} */ masterKeyBytes,
) {
  const key = await deriveUserKey(masterKeyBytes, userId);
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ct);
  const plainBuffer = await subtleCrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plainBuffer);
}

async function main() {
  const raw = readDevVar("ENCRYPTION_KEY");
  if (!raw) {
    console.error("[roundtrip] ENCRYPTION_KEY missing from .dev.vars");
    process.exit(1);
  }
  const masterBytes = base64ToBytes(raw);
  if (masterBytes.byteLength !== MASTER_KEY_BYTE_LENGTH) {
    console.error(
      `[roundtrip] ENCRYPTION_KEY must decode to ${MASTER_KEY_BYTE_LENGTH} bytes (got ${masterBytes.byteLength})`,
    );
    process.exit(1);
  }

  const userIdA = "00000000-0000-0000-0000-000000000001";
  const userIdB = "00000000-0000-0000-0000-000000000002";
  const plaintext = "sk-ant-test-roundtrip-DO-NOT-USE";

  // Round-trip
  const blobA = await encryptApiKey(plaintext, userIdA, masterBytes);
  const decryptedA = await decryptApiKey(blobA, userIdA, masterBytes);
  if (decryptedA !== plaintext) {
    console.error("[roundtrip] decrypt(encrypt(p)) !== p (same userId)");
    process.exit(1);
  }

  // Cross-user: same plaintext under different userId must NOT decrypt under wrong userId
  const blobB = await encryptApiKey(plaintext, userIdB, masterBytes);
  if (blobA.ct === blobB.ct) {
    console.error("[roundtrip] HKDF-per-user diversification missing (ciphertexts collide)");
    process.exit(1);
  }
  let crossUserFailed = false;
  try {
    await decryptApiKey(blobA, userIdB, masterBytes);
  } catch {
    crossUserFailed = true;
  }
  if (!crossUserFailed) {
    console.error("[roundtrip] cross-user decrypt unexpectedly succeeded");
    process.exit(1);
  }

  // Envelope shape
  if (blobA.v !== 1 || blobA.alg !== "aes-256-gcm" || !blobA.iv || !blobA.ct) {
    console.error("[roundtrip] envelope shape drifted from EncryptedBlob contract");
    process.exit(1);
  }

  // Master-key isolation: ciphertext from K1 must NOT decrypt under K2
  const otherMasterBytes = subtleCrypto.getRandomValues(new Uint8Array(MASTER_KEY_BYTE_LENGTH));
  let crossKeyFailed = false;
  try {
    await decryptApiKey(blobA, userIdA, otherMasterBytes);
  } catch {
    crossKeyFailed = true;
  }
  if (!crossKeyFailed) {
    console.error("[roundtrip] cross-master-key decrypt unexpectedly succeeded");
    process.exit(1);
  }

  console.log(
    "[roundtrip] ok — round-trip + per-user diversification + master-key isolation + envelope shape verified",
  );
  process.exit(0);
}

main().catch((/** @type {unknown} */ err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[roundtrip] unexpected error:", msg);
  process.exit(1);
});
