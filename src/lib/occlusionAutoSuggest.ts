/** Whether OcclusionRegionEditor should kick off Suggest without a click. */
export function shouldAutoSuggestRegions(args: {
  disabled: boolean;
  imageKey: string;
  regionCount: number;
  attemptedKey: string | null;
}): boolean {
  if (args.disabled) return false;
  const key = args.imageKey.trim();
  if (!key) return false;
  if (args.regionCount > 0) return false;
  if (args.attemptedKey === key) return false;
  return true;
}
