import { describe, it, expect } from "vitest";
import {
  appendExtraUserSuffix,
  avoidPatternsPromptSuffix,
  buildAvoidPatternsFromRejected,
  buildExtraUserSuffix,
  studyStrugglePromptSuffix,
} from "../../worker/generation/feedback-hints";

const plain = (fronts: unknown[]) =>
  fronts.map((front) => ({ front, reason: null }));

describe("buildAvoidPatternsFromRejected", () => {
  it("returns empty for empty input", () => {
    expect(buildAvoidPatternsFromRejected(plain([]))).toEqual([]);
  });

  it("trims, skips empty and non-string, and keeps order", () => {
    expect(
      buildAvoidPatternsFromRejected(
        plain([
          "  alpha  ",
          "",
          "   ",
          null,
          42,
          undefined,
          { front: "x" },
          "beta",
        ]),
      ),
    ).toEqual(["alpha", "beta"]);
  });

  it("dedupes case-insensitively keeping the first casing", () => {
    expect(
      buildAvoidPatternsFromRejected(
        plain(["Cranial Nerves", "cranial nerves", "CRANIAL NERVES"]),
      ),
    ).toEqual(["Cranial Nerves"]);
  });

  it("truncates each pattern to 80 characters", () => {
    const long = "x".repeat(100);
    const patterns = buildAvoidPatternsFromRejected(plain([long]));
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toHaveLength(80);
    expect(patterns[0]).toBe("x".repeat(80));
  });

  it("caps at 8 patterns", () => {
    const fronts = Array.from({ length: 12 }, (_, i) => `front-${i}`);
    expect(buildAvoidPatternsFromRejected(plain(fronts))).toEqual(
      fronts.slice(0, 8),
    );
  });

  it("annotates a known reason after truncating the stem", () => {
    const long = "y".repeat(100);
    expect(
      buildAvoidPatternsFromRejected([{ front: long, reason: "vague" }]),
    ).toEqual([`${"y".repeat(80)} (reason: too vague)`]);
  });

  it("ranks reasoned rejects first so they win the cap", () => {
    const entries = [
      ...plain(Array.from({ length: 8 }, (_, i) => `plain-${i}`)),
      { front: "late", reason: "duplicate" },
    ];
    const out = buildAvoidPatternsFromRejected(entries);
    expect(out).toHaveLength(8);
    expect(out[0]).toBe("late (reason: duplicate)");
    expect(out).not.toContain("plain-7");
  });

  it("keeps the reasoned copy when a stem repeats", () => {
    expect(
      buildAvoidPatternsFromRejected([
        { front: "Same", reason: null },
        { front: "same", reason: "inaccurate" },
      ]),
    ).toEqual(["same (reason: inaccurate)"]);
  });
});

describe("avoidPatternsPromptSuffix", () => {
  it("returns empty string when patterns are absent", () => {
    expect(avoidPatternsPromptSuffix([])).toBe("");
  });

  it("mentions avoid, rejected stems, and grounded constraint", () => {
    const suffix = avoidPatternsPromptSuffix(["bad stem"]);
    expect(suffix.toLowerCase()).toContain("bad stem");
    expect(suffix.toLowerCase()).toMatch(/avoid/);
    expect(suffix.toLowerCase()).toMatch(/do not invent/);
  });
});

describe("studyStrugglePromptSuffix", () => {
  it("returns empty when again_14d and lapses are both zero", () => {
    expect(studyStrugglePromptSuffix({ again_14d: 0, lapses: 0 })).toBe("");
  });

  it("returns a clarity/atomicity nudge when again_14d >= 1", () => {
    const suffix = studyStrugglePromptSuffix({ again_14d: 1, lapses: 0 });
    expect(suffix.length).toBeGreaterThan(0);
    expect(suffix.toLowerCase()).toMatch(/clarit|atomic/);
  });

  it("returns a clarity/atomicity nudge when lapses >= 1", () => {
    const suffix = studyStrugglePromptSuffix({ again_14d: 0, lapses: 2 });
    expect(suffix.length).toBeGreaterThan(0);
    expect(suffix.toLowerCase()).toMatch(/clarit|atomic/);
  });
});

describe("buildExtraUserSuffix", () => {
  it("returns empty when no parts produce text", () => {
    expect(buildExtraUserSuffix({})).toBe("");
    expect(buildExtraUserSuffix({ topicHints: [], avoidPatterns: [] })).toBe(
      "",
    );
    expect(
      buildExtraUserSuffix({ studyStruggle: { again_14d: 0, lapses: 0 } }),
    ).toBe("");
  });

  it("returns topic suffix alone", () => {
    const suffix = buildExtraUserSuffix({ topicHints: ["cranial nerves"] });
    expect(suffix.toLowerCase()).toContain("cranial nerves");
    expect(suffix.toLowerCase()).toMatch(/assess/);
  });

  it("returns avoid suffix alone", () => {
    const suffix = buildExtraUserSuffix({ avoidPatterns: ["bad stem"] });
    expect(suffix.toLowerCase()).toContain("bad stem");
    expect(suffix.toLowerCase()).toMatch(/avoid/);
  });

  it("returns struggle suffix alone", () => {
    const suffix = buildExtraUserSuffix({
      studyStruggle: { again_14d: 1, lapses: 0 },
    });
    expect(suffix.toLowerCase()).toMatch(/clarit|atomic/);
  });

  it("orders topic before avoid before struggle", () => {
    const suffix = buildExtraUserSuffix({
      topicHints: ["cranial nerves"],
      avoidPatterns: ["bad stem"],
      studyStruggle: { again_14d: 1, lapses: 0 },
    });
    const topicAt = suffix.toLowerCase().indexOf("cranial nerves");
    const avoidAt = suffix.toLowerCase().indexOf("bad stem");
    const struggleAt = suffix.toLowerCase().indexOf("struggling");
    expect(topicAt).toBeGreaterThanOrEqual(0);
    expect(avoidAt).toBeGreaterThan(topicAt);
    expect(struggleAt).toBeGreaterThan(avoidAt);
  });
});

describe("appendExtraUserSuffix", () => {
  it("is a no-op when suffix is empty", () => {
    expect(appendExtraUserSuffix("base prompt", "")).toBe("base prompt");
  });

  it("appends the suffix after the prompt", () => {
    const prompt = appendExtraUserSuffix("base prompt", "extra bit");
    expect(prompt).toBe("base prompt\n\nextra bit");
  });
});
