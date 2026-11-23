import { DIY_OCCLUSION_FREE_PATH_NOTICE } from "../materials/learningObjectivesOffer";

export { DIY_OCCLUSION_FREE_PATH_NOTICE };

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
