import { describe, expect, it } from "vitest";
import {
  buildMcqOptions,
  pickMcqDistractors,
} from "../../../src/anatomy/quiz/mcqDistractors";
import type { AnatomyStructure } from "../../../src/anatomy/types";

const structures: AnatomyStructure[] = [
  { id: "femur", label: "Femur", node: "Femur", region: "Right_Back" },
  { id: "tibia", label: "Tibia", node: "Tibia", region: "Right_Back" },
  { id: "fibula", label: "Fibula", node: "Fibula", region: "Right_Back" },
  { id: "patella", label: "Patella", node: "Patella", region: "Right_Back" },
  { id: "skull", label: "Skull", node: "Skull", region: "skull" },
];

describe("pickMcqDistractors", () => {
  it("samples N from the same region and excludes the target", () => {
    const picks = pickMcqDistractors(structures, "femur", 2, () => 0);
    expect(picks).toHaveLength(2);
    expect(picks.every((s) => s.id !== "femur")).toBe(true);
    expect(picks.every((s) => s.region === "Right_Back")).toBe(true);
  });

  it("never includes structures from other regions", () => {
    const picks = pickMcqDistractors(structures, "femur", 10, () => 0);
    expect(picks.map((s) => s.id).sort()).toEqual([
      "fibula",
      "patella",
      "tibia",
    ]);
    expect(picks.some((s) => s.id === "skull")).toBe(false);
  });

  it("returns fewer than N when the region pool is small", () => {
    const picks = pickMcqDistractors(structures, "skull", 3, () => 0);
    expect(picks).toHaveLength(0);
  });

  it("returns empty when the target is unknown", () => {
    expect(pickMcqDistractors(structures, "missing", 2, () => 0)).toEqual([]);
  });

  it("uses region-less structures as one pool when target has no region", () => {
    const loose: AnatomyStructure[] = [
      { id: "a", label: "A", node: "A" },
      { id: "b", label: "B", node: "B" },
      { id: "c", label: "C", node: "C", region: "x" },
    ];
    const picks = pickMcqDistractors(loose, "a", 2, () => 0);
    expect(picks.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("buildMcqOptions", () => {
  it("returns empty when the region has no distractors", () => {
    expect(buildMcqOptions(structures, "skull", 3, () => 0)).toEqual([]);
  });

  it("includes the target plus distractors when the pool is large enough", () => {
    const options = buildMcqOptions(structures, "femur", 2, () => 0);
    expect(options).toHaveLength(3);
    expect(options.some((s) => s.id === "femur")).toBe(true);
    expect(options.every((s) => s.region === "Right_Back")).toBe(true);
  });
});
