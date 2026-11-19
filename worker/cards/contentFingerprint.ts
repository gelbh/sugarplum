import { sha256Hex } from "../materials/content-hash";

export function normalizeCardField(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function frontToFingerprintText(front: unknown): string {
  if (typeof front === "string") return normalizeCardField(front);
  if (front == null) return "";
  return normalizeCardField(JSON.stringify(front));
}

/** Sync payload shared by Worker SHA-256 and Node backfill script. */
export function assembleCardFingerprintPayload(input: {
  type: string;
  front: unknown;
  mediaR2Keys?: string[] | null;
  back?: unknown;
  options?: string[] | null;
}): string {
  const media = [...(input.mediaR2Keys ?? [])].filter(Boolean).sort().join("\0");
  const parts = [input.type, frontToFingerprintText(input.front), media];
  if (input.type === "mcq") {
    const answer =
      typeof input.back === "string"
        ? normalizeCardField(input.back)
        : normalizeCardField(JSON.stringify(input.back ?? ""));
    const opts = [...(input.options ?? [])]
      .map((o) => normalizeCardField(o))
      .sort()
      .join("\0");
    parts.push(answer, opts);
  }
  return parts.join("\0");
}

export async function cardContentFingerprint(input: {
  type: string;
  front: unknown;
  mediaR2Keys?: string[] | null;
  back?: unknown;
  options?: string[] | null;
}): Promise<string> {
  return sha256Hex(assembleCardFingerprintPayload(input));
}
