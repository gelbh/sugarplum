export const DIY_OCCLUSION_FREE_PATH_NOTICE =
  "Image ready. Free path opens an Occlusion card so you can add boxes or tap Suggest regions (or add a BYO API key for auto vision drafts).";

export function openDiyOcclusionFromImageKey(args: {
  imageKey: string;
  prepare: (key: string) => void;
  goDiy: () => void;
  setNotice: (message: string) => void;
}): boolean {
  const key = args.imageKey.trim();
  if (!key) return false;
  args.prepare(key);
  args.goDiy();
  args.setNotice(DIY_OCCLUSION_FREE_PATH_NOTICE);
  return true;
}
