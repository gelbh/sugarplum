import { DIY_OCCLUSION_FREE_PATH_NOTICE } from "../deckHub/openDiyOcclusion";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const FREE_PATH_IMAGE_HELPER =
  "Free path opens an Occlusion card (add boxes or Suggest regions). Add a BYO API key under Settings for auto vision drafts; Learning objectives apply on that path.";

/** Create-flow notice: material stored; no DIY open on this surface. */
export const CREATE_FREE_PATH_IMAGE_NOTICE =
  "Stored image on the free path. Auto vision drafts need a BYO API key under Settings. Open the deck hub to add an Occlusion card, or upload again after saving a key.";

const IGNORED_LO =
  " Learning objectives were not used on the free image path.";

export function isImageUploadContentType(contentType: string): boolean {
  return IMAGE_TYPES.has(contentType);
}

/** Hide LO until BYO is confirmed for images. Non-images always offer LO. */
export function shouldOfferLearningObjectives(args: {
  isImage: boolean;
  llmConfigured: boolean | null;
}): boolean {
  if (!args.isImage) return true;
  return args.llmConfigured === true;
}

/** Free-path helper only when BYO is confirmed missing (not while loading). */
export function freePathImageHelperText(args: {
  isImage: boolean;
  llmConfigured: boolean | null;
}): string | null {
  if (!args.isImage || args.llmConfigured !== false) return null;
  return FREE_PATH_IMAGE_HELPER;
}

export function uploadSubmitLabel(args: {
  isImage: boolean;
  llmConfigured: boolean | null;
}): "Continue" | "Start generation" {
  if (args.isImage && args.llmConfigured === false) return "Continue";
  return "Start generation";
}

/** Disable submit for images until settings resolve (avoid false Continue/Start). */
export function uploadSubmitDisabled(args: {
  isImage: boolean;
  llmConfigured: boolean | null;
  busy: boolean;
}): boolean {
  if (args.busy) return true;
  if (args.isImage && args.llmConfigured === null) return true;
  return false;
}

export function diyOcclusionNotice(args: {
  hadLearningObjectives: boolean;
}): string {
  if (!args.hadLearningObjectives) return DIY_OCCLUSION_FREE_PATH_NOTICE;
  return `${DIY_OCCLUSION_FREE_PATH_NOTICE}${IGNORED_LO}`;
}

export function createFreePathImageNotice(args: {
  hadLearningObjectives: boolean;
}): string {
  if (!args.hadLearningObjectives) return CREATE_FREE_PATH_IMAGE_NOTICE;
  return `${CREATE_FREE_PATH_IMAGE_NOTICE}${IGNORED_LO}`;
}
