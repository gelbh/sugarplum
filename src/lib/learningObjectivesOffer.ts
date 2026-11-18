import { DIY_OCCLUSION_FREE_PATH_NOTICE } from "../deckHub/openDiyOcclusion";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const FREE_PATH_IMAGE_HELPER =
  "Free path opens an Occlusion card (add boxes or Suggest regions). Add a BYO API key under Settings for auto vision drafts; Learning objectives apply on that path.";

const IGNORED_LO =
  " Learning objectives were not used on the free image path.";

export function isImageUploadContentType(contentType: string): boolean {
  return IMAGE_TYPES.has(contentType);
}

export function shouldOfferLearningObjectives(args: {
  isImage: boolean;
  llmConfigured: boolean | null;
}): boolean {
  if (!args.isImage) return true;
  return args.llmConfigured === true;
}

export function uploadSubmitLabel(args: {
  isImage: boolean;
  llmConfigured: boolean | null;
}): "Continue" | "Start generation" {
  if (args.isImage && args.llmConfigured !== true) return "Continue";
  return "Start generation";
}

export function diyOcclusionNotice(args: {
  hadLearningObjectives: boolean;
}): string {
  if (!args.hadLearningObjectives) return DIY_OCCLUSION_FREE_PATH_NOTICE;
  return `${DIY_OCCLUSION_FREE_PATH_NOTICE}${IGNORED_LO}`;
}
