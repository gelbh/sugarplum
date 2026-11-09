/** FSRS-6 parameter vector length (ts-fsrs 5.x default_w). */
export const FSRS_W_LENGTH = 21;

/** Return a copy of `w` when it is exactly 21 finite numbers; otherwise null. */
export function validateFsrsW(w: unknown): number[] | null {
  if (!Array.isArray(w) || w.length !== FSRS_W_LENGTH) return null;
  const out: number[] = [];
  for (const x of w) {
    if (typeof x !== "number" || !Number.isFinite(x)) return null;
    out.push(x);
  }
  return out;
}

/** Parse stored `fsrs_w_json`; undefined when null/invalid. */
export function parseFsrsWJson(raw: string | null | undefined): number[] | undefined {
  if (raw == null || raw === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateFsrsW(parsed) ?? undefined;
  } catch {
    return undefined;
  }
}
