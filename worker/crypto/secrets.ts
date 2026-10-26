/**
 * AES-GCM wrap for BYO LLM API keys (crypto.subtle).
 * Packed ciphertext: aes-gcm$ivB64$ctB64$last4 — GET can read last4 without decrypt.
 */

const PREFIX = "aes-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Decode SECRETS_WRAP_KEY: raw UTF-8 of length 32, or base64 that decodes to 32 bytes. */
export function wrapKeyBytes(wrapKey: string): Uint8Array {
  const raw = new TextEncoder().encode(wrapKey);
  if (raw.byteLength === KEY_BYTES) return raw;
  try {
    const decoded = b64ToBytes(wrapKey);
    if (decoded.byteLength === KEY_BYTES) return decoded;
  } catch {
    /* not valid base64 */
  }
  throw new Error("SECRETS_WRAP_KEY must be 32 bytes (raw UTF-8 or base64)");
}

async function importAesKey(wrapKey: string): Promise<CryptoKey> {
  const key = wrapKeyBytes(wrapKey);
  return crypto.subtle.importKey(
    "raw",
    key.slice().buffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Last 4 characters of the API key for display (never the full key). */
export function apiKeyLast4(apiKey: string): string {
  if (apiKey.length <= 4) return apiKey;
  return apiKey.slice(-4);
}

/**
 * Encrypt an API key. Returns packed string for `user_secrets.ciphertext`.
 * Format: aes-gcm$ivB64$ctB64$last4
 */
export async function encryptSecret(
  plaintext: string,
  wrapKey: string,
): Promise<string> {
  const key = await importAesKey(wrapKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${PREFIX}$${bytesToB64(iv)}$${bytesToB64(new Uint8Array(ct))}$${apiKeyLast4(plaintext)}`;
}

/**
 * Unpack `aes-gcm$iv$ct$last4`. Only the first three `$` are separators so
 * last4 may itself contain `$` without breaking decrypt/meta parse.
 */
export function unpackSecretPacked(
  packed: string,
): { ivB64: string; ctB64: string; last4: string } | null {
  const parts = packed.split("$");
  if (parts.length < 4 || parts[0] !== PREFIX) return null;
  const ivB64 = parts[1]!;
  const ctB64 = parts[2]!;
  const last4 = parts.slice(3).join("$");
  if (!ivB64 || !ctB64 || !last4) return null;
  return { ivB64, ctB64, last4 };
}

/** Decrypt a packed ciphertext from `user_secrets`. */
export async function decryptSecret(
  packed: string,
  wrapKey: string,
): Promise<string> {
  const unpacked = unpackSecretPacked(packed);
  if (!unpacked) {
    throw new Error("Invalid secret ciphertext format");
  }
  const iv = b64ToBytes(unpacked.ivB64);
  const ct = b64ToBytes(unpacked.ctB64);
  const key = await importAesKey(wrapKey);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.slice().buffer },
    key,
    ct.slice().buffer,
  );
  return new TextDecoder().decode(pt);
}

/** Parse display metadata from packed ciphertext without decrypting. */
export function parseSecretMeta(
  packed: string,
): { last4: string } | null {
  const unpacked = unpackSecretPacked(packed);
  if (!unpacked) return null;
  return { last4: unpacked.last4 };
}
