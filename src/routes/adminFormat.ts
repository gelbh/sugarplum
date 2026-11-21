export function formatAdminDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Compact table dates (e.g. 21 Nov, 13:06). */
export function formatAdminDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact ints for admin metrics (e.g. 1371687 → 1.4M). */
export function formatAdminCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 10_000) return String(Math.trunc(n));
  if (abs < 1_000_000) {
    const k = n / 1_000;
    return `${k >= 100 || k <= -100 ? Math.round(k) : Number(k.toFixed(1))}k`;
  }
  const m = n / 1_000_000;
  return `${m >= 100 || m <= -100 ? Math.round(m) : Number(m.toFixed(1))}M`;
}
