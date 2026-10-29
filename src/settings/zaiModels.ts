/** Client mirror of worker ZAI_TEXT_MODELS (ids must match exactly). */
export const ZAI_TEXT_MODEL_OPTIONS = [
  { value: "glm-4.7-flash", label: "GLM-4.7 Flash (free)" },
  { value: "glm-4.7-flashx", label: "GLM-4.7 FlashX" },
  { value: "glm-4.7", label: "GLM-4.7" },
] as const;

export const ZAI_DEFAULT_TEXT_MODEL = "glm-4.7-flash" as const;

export type ZaiTextModelOption =
  (typeof ZAI_TEXT_MODEL_OPTIONS)[number]["value"];
