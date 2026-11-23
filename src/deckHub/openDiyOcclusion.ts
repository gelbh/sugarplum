/** Shared free-path DIY occlusion opener copy (also mirrored in materials LO helpers). */
export const DIY_OCCLUSION_FREE_PATH_NOTICE =
  "Image ready. Free path opens an Occlusion card so you can add boxes or tap Suggest regions (or add a BYO API key for auto vision drafts).";

export function openDiyOcclusionFromImageKey(args: {
  imageKey: string;
  prepare: (key: string) => void;
  goDiy: () => void;
  setNotice: (message: string) => void;
  notice?: string;
}): boolean {
  const key = args.imageKey.trim();
  if (!key) return false;
  args.prepare(key);
  args.goDiy();
  args.setNotice(args.notice ?? DIY_OCCLUSION_FREE_PATH_NOTICE);
  return true;
}
