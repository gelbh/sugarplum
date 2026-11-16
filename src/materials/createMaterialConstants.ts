import { PPTX_MIME } from "../api/client";

export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);
export const CREATE_NEW_DECK = "__create_new_deck__";
export const CREATE_NEW_SUBJECT = "__create_new_subject__";
export const FIGURES_SKIPPED_NOTICE = "Figure crops skipped for split uploads";
