/**
 * Password hashing via Web Crypto PBKDF2-SHA256 (crypto.subtle).
 * Chosen over @noble/hashes so the Worker stays dependency-free and uses
 * the platform SubtleCrypto API available in Cloudflare Workers.
 */

export const MIN_PASSWORD_LENGTH = 12;

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const PREFIX = "pbkdf2-sha256";

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

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      // BufferSource: copy into a fresh ArrayBuffer for TS DOM lib compatibility
      salt: salt.slice().buffer,
      iterations,
    },
    baseKey,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** True when password meets the minimum length. */
export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/** Hash a password for storage. Format: pbkdf2-sha256$iter$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

/** Verify a password against a stored hash string. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = b64ToBytes(parts[2]!);
  const expected = b64ToBytes(parts[3]!);
  const actual = await deriveKey(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
