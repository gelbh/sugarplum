export function toggleRegionId(active: Set<string>, id: string): string[] {
  const next = new Set(active);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return [...next];
}

export function addRegionIds(active: Set<string>, ids: string[]): string[] {
  return [...new Set([...active, ...ids])];
}

export function removeRegionIds(active: Set<string>, ids: string[]): string[] {
  return [...active].filter((id) => !ids.includes(id));
}
