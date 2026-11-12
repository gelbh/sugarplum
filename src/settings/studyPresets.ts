import type { StudyPrefs } from "../study/policyQueue";

export type StudyLoadPresetId = "light" | "steady" | "catchUp";

export type StudyLoadPreset = {
  introBudget: number;
  reviewBudget: number;
  label: string;
  blurb: string;
};

export const STUDY_LOAD_PRESETS: Record<StudyLoadPresetId, StudyLoadPreset> = {
  light: {
    introBudget: 10,
    reviewBudget: 100,
    label: "Light",
    blurb: "Busy week",
  },
  steady: {
    introBudget: 20,
    reviewBudget: 200,
    label: "Steady",
    blurb: "Default pace",
  },
  catchUp: {
    introBudget: 80,
    reviewBudget: 500,
    label: "Catch up",
    blurb: "More new cards today",
  },
};

export const STUDY_LOAD_PRESET_ORDER: readonly StudyLoadPresetId[] = [
  "light",
  "steady",
  "catchUp",
] as const;

export function matchStudyPreset(
  introBudget: number,
  reviewBudget: number,
): StudyLoadPresetId | "custom" {
  for (const id of STUDY_LOAD_PRESET_ORDER) {
    const p = STUDY_LOAD_PRESETS[id];
    if (p.introBudget === introBudget && p.reviewBudget === reviewBudget) {
      return id;
    }
  }
  return "custom";
}

export function applyStudyPreset(
  prefs: StudyPrefs,
  id: StudyLoadPresetId,
): StudyPrefs {
  const p = STUDY_LOAD_PRESETS[id];
  return {
    ...prefs,
    introBudget: p.introBudget,
    reviewBudget: p.reviewBudget,
  };
}
