export function formatEtkTooltip(etk: number): string {
  const rounded = Math.round(etk * 10) / 10;
  const n = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `~${n} card-equivalents`;
}
