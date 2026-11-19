import { describe, expect, it, vi } from "vitest";
import { runHygieneRegenAll } from "../../src/deckHub/hygieneRegenAll";
import type { RegenCardType } from "../../src/api/types";

function resolveType(type: string): RegenCardType | null {
  if (type === "qa" || type === "cloze" || type === "mcq") return type;
  return null;
}

describe("runHygieneRegenAll", () => {
  it("calls regen in order with mapped types", async () => {
    const calls: Array<{ id: string; type: RegenCardType }> = [];
    const regen = vi.fn(async (id: string, type: RegenCardType) => {
      calls.push({ id, type });
    });

    const result = await runHygieneRegenAll({
      cards: [
        { id: "a", type: "qa", front_preview: "A" },
        { id: "b", type: "cloze", front_preview: "B" },
        { id: "c", type: "mcq", front_preview: "C" },
      ],
      resolveType,
      regen,
    });

    expect(calls).toEqual([
      { id: "a", type: "qa" },
      { id: "b", type: "cloze" },
      { id: "c", type: "mcq" },
    ]);
    expect(result).toEqual({
      succeeded: 3,
      skipped: 0,
      failedAt: null,
      error: null,
    });
  });

  it("stops on first rejection and reports partial success", async () => {
    const regen = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("nope");
    });

    const result = await runHygieneRegenAll({
      cards: [
        { id: "a", type: "qa", front_preview: "Alpha" },
        { id: "b", type: "qa", front_preview: "Beta" },
        { id: "c", type: "qa", front_preview: "Gamma" },
      ],
      resolveType,
      regen,
    });

    expect(regen).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(1);
    expect(result.failedAt).toEqual({ id: "b", front_preview: "Beta" });
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe("nope");
  });

  it("skips cards with null regen types", async () => {
    const regen = vi.fn(async () => undefined);

    const result = await runHygieneRegenAll({
      cards: [
        { id: "a", type: "qa", front_preview: "A" },
        { id: "x", type: "image", front_preview: "X" },
        { id: "b", type: "cloze", front_preview: "B" },
      ],
      resolveType,
      regen,
    });

    expect(regen).toHaveBeenCalledTimes(2);
    expect(regen.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(result.succeeded).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failedAt).toBeNull();
  });

  it("invokes onProgress after each success with done/total", async () => {
    const progress: Array<{ done: number; total: number }> = [];
    const regen = vi.fn(async () => undefined);

    await runHygieneRegenAll({
      cards: [
        { id: "a", type: "qa", front_preview: "A" },
        { id: "b", type: "qa", front_preview: "B" },
        { id: "skip", type: "image", front_preview: "S" },
      ],
      resolveType,
      regen,
      onProgress: (p) => progress.push({ ...p }),
    });

    expect(progress).toEqual([
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  });
});
