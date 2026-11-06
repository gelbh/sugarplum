export type Stretch = { start: string; end: string };

const HORIZON_MS = 36 * 60 * 60 * 1000;
const MIN_STRETCH_MS = 5 * 60 * 1000;
const SECONDS_PER_CARD = 30;

function mergeBusy(busy: Stretch[], start: number, end: number): Stretch[] {
  const clipped = busy
    .map((b) => ({
      start: Math.max(Date.parse(b.start), start),
      end: Math.min(Date.parse(b.end), end),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const block of clipped) {
    const last = merged[merged.length - 1];
    if (!last || block.start > last.end) merged.push({ ...block });
    else last.end = Math.max(last.end, block.end);
  }
  return merged.map((b) => ({
    start: new Date(b.start).toISOString(),
    end: new Date(b.end).toISOString(),
  }));
}

export function studyCap(args: {
  now: string;
  busy: Stretch[];
  queueLength: number;
}): { cap: number | null; stretch: Stretch | null } {
  const startMs = Date.parse(args.now);
  const endMs = startMs + HORIZON_MS;
  const busyMerged = mergeBusy(args.busy, startMs, endMs);
  let cursor = startMs;
  let chosen: Stretch | null = null;
  for (const block of busyMerged) {
    const blockStart = Date.parse(block.start);
    if (blockStart - cursor >= MIN_STRETCH_MS) {
      chosen = {
        start: new Date(cursor).toISOString(),
        end: new Date(blockStart).toISOString(),
      };
      break;
    }
    cursor = Math.max(cursor, Date.parse(block.end));
  }
  if (!chosen && endMs - cursor >= MIN_STRETCH_MS) {
    chosen = {
      start: new Date(cursor).toISOString(),
      end: new Date(endMs).toISOString(),
    };
  }
  if (!chosen) return { cap: null, stretch: null };
  const cards = Math.floor(
    (Date.parse(chosen.end) - Date.parse(chosen.start)) / 1000 / SECONDS_PER_CARD,
  );
  if (cards >= args.queueLength) return { cap: null, stretch: chosen };
  return { cap: cards, stretch: chosen };
}
