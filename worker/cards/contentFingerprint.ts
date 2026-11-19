import { sha256Hex } from "../materials/content-hash";

export function normalizeCardField(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function frontToFingerprintText(front: unknown): string {
  if (typeof front === "string") return normalizeCardField(front);
  if (front == null) return "";
  return normalizeCardField(JSON.stringify(front));
}

function normalizeBackField(back: unknown): string {
  if (typeof back === "string") return normalizeCardField(back);
  if (back == null) return "";
  return normalizeCardField(JSON.stringify(back));
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
    const opts = [...(input.options ?? [])]
      .map((o) => normalizeCardField(o))
      .sort()
      .join("\0");
    parts.push(normalizeBackField(input.back), opts);
  } else if (input.type === "image_label" || input.type === "diagram") {
    parts.push(normalizeBackField(input.back));
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
