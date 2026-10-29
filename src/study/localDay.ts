/** Client local calendar day as `YYYY-MM-DD` (browser timezone). */
export function clientLocalDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const LOCAL_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Start of the client's local calendar day as ISO (UTC fallback). */
export function resolveLocalDayStartIso(
  now: Date,
  opts: { localDay?: string | null; tzOffsetMinutes?: number | null },
): string {
  const offset =
    typeof opts.tzOffsetMinutes === "number" &&
    Number.isFinite(opts.tzOffsetMinutes)
      ? opts.tzOffsetMinutes
      : null;

  if (opts.localDay && LOCAL_DAY_RE.test(opts.localDay)) {
    const [y, m, d] = opts.localDay.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    if (offset != null) {
      return new Date(Date.UTC(y, m - 1, d) + offset * 60_000).toISOString();
    }
    return `${opts.localDay}T00:00:00.000Z`;
  }

  if (offset != null) {
    const local = new Date(now.getTime() - offset * 60_000);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    return new Date(Date.UTC(y, m, d) + offset * 60_000).toISOString();
  }

  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d)).toISOString();
}
