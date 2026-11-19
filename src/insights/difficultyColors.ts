import type { ChartColorSet } from "./chartColors";

/** Scheme-aware FSRS difficulty ladder (not Anki traffic lights). */
export function difficultySegmentColors(scheme: ChartColorSet["scheme"]) {
  if (scheme === "dark") {
    return {
      easy: "rgba(206, 147, 216, 0.32)",
      medium: "rgba(206, 147, 216, 0.58)",
      hard: "#CE93D8",
    } as const;
  }
  return {
    easy: "rgba(91, 44, 111, 0.32)",
    medium: "rgba(91, 44, 111, 0.58)",
    hard: "#5B2C6F",
  } as const;
}

export const DIFFICULTY_SEGMENTS = [
  { key: "easy" as const, label: "Easy" },
  { key: "medium" as const, label: "Medium" },
  { key: "hard" as const, label: "Hard" },
];
