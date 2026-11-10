/** FSRS-7 parameter vector length (ts-fsrs 6.x DefaultScheduler default). */
export const FSRS_W_LENGTH = 34;

/** Legacy FSRS-6 length; cleared on FSRS-7 cutover. */
export const FSRS6_W_LENGTH = 21;

/** Return a copy of `w` when it is exactly 34 finite numbers; otherwise null. */
export function validateFsrsW(w: unknown): number[] | null {
  if (!Array.isArray(w) || w.length !== FSRS_W_LENGTH) return null;
  const out: number[] = [];
  for (const x of w) {
    if (typeof x !== "number" || !Number.isFinite(x)) return null;
    out.push(x);
  }
  return out;
}

/** True when stored vector is legacy FSRS-6 (21). */
export function isLegacyFsrs6W(w: unknown): boolean {
  if (!Array.isArray(w) || w.length !== FSRS6_W_LENGTH) return false;
  return w.every((x) => typeof x === "number" && Number.isFinite(x));
}

/** Parse stored `fsrs_w_json`; undefined when null/invalid/legacy. */
export function parseFsrsWJson(
  raw: string | null | undefined,
): number[] | undefined {
  if (raw == null || raw === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateFsrsW(parsed) ?? undefined;
  } catch {
    return undefined;
  }
}
