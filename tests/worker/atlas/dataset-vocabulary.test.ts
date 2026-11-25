import { describe, expect, it } from "vitest";
import {
  HOST_TERMS,
  ORGAN_TERMS,
  hostCovers,
  organCovers,
} from "../../../worker/atlas/datasets/vocab";

describe("vocabulary", () => {
  it("covers narrower terms only", () => {
    expect(hostCovers("small ruminant", "sheep")).toBe(true);
    expect(hostCovers("sheep", "small ruminant")).toBe(false);
    expect(organCovers("liver", "bile ducts")).toBe(true);
  });

  it("has no cycles in the broader graph", () => {
    for (const terms of [HOST_TERMS, ORGAN_TERMS]) {
      const state = new Map<string, "open" | "done">();
      const visit = (k: string, path: string[]) => {
        expect(state.get(k), `cycle: ${[...path, k].join(" -> ")}`).not.toBe(
          "open",
        );
        if (state.get(k) === "done") return;
        state.set(k, "open");
        for (const b of terms[k]?.broader ?? []) visit(b, [...path, k]);
        state.set(k, "done");
      };
      for (const k of Object.keys(terms)) visit(k, []);
    }
  });
});
