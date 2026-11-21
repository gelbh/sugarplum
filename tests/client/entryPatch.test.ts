import { describe, expect, it } from "vitest";
import { ALIAS_MAX_ITEMS } from "../../src/atlas/hub/nameMatch";
import {
  DIAGNOSTIC_OWNED_ERROR,
  PPP_ERROR,
  diffEntryPatch,
  draftFromEntry,
  isEmptyPatch,
  validateEntryPatch,
  withFieldFromEntry,
} from "../../src/atlas/mutate/entryPatch";
import type { AtlasEntryView } from "../../src/atlas/types";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

function entry(overrides: Partial<AtlasEntryView> = {}): AtlasEntryView {
  return {
    id: "row-1",
    originKey: "psoroptes-ovis",
    canonicalName: "Psoroptes ovis",
    commonName: "Sheep scab mite",
    aliases: ["scab mite", "sheep scab"],
    learnerAliases: ["sheep scab"],
    fields: {
      ...emptyParasiteFields(),
      group: "arthropod",
      definitiveHosts: ["sheep"],
      significance: "Notifiable in some countries.",
      pppDays: { min: 10, max: 14 },
      diagnosticTests: [
        { name: "Skin scraping", sample: "skin", windowStartWeek: 2, windowEndWeek: 6 },
      ],
    } as AtlasEntryView["fields"],
    refs: [],
    images: [],
    editedAt: null,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields: [],
    commonNameEdited: false,
    ...overrides,
  };
}

describe("diffEntryPatch", () => {
  it("returns an empty patch for an untouched draft", () => {
    const e = entry();
    const patch = diffEntryPatch(e, draftFromEntry(e));
    expect(patch).toEqual({});
    expect(isEmptyPatch(patch)).toBe(true);
  });

  it("sends only the changed keys", () => {
    const e = entry();
    const draft = {
      ...draftFromEntry(e),
      commonName: "  Scab mite ",
      significance: "Causes sheep scab.",
      distribution: "",
    };
    expect(diffEntryPatch(e, draft)).toEqual({
      commonName: "Scab mite",
      fields: { significance: "Causes sheep scab." },
    });
  });

  it("compares aliases against the learner list only", () => {
    const e = entry();
    const draft = {
      ...draftFromEntry(e),
      aliases: "sheep scab\n  scab mite \n\nSheep  Scab",
    };
    expect(draftFromEntry(e).aliases).toBe("sheep scab");
    expect(diffEntryPatch(e, draft)).toEqual({
      aliases: ["sheep scab", "scab mite"],
    });
  });

  it("sends canonicalName only for learner-added entries", () => {
    const builtIn = entry();
    const learner = entry({ originKey: null });
    const rename = (e: AtlasEntryView) => ({
      ...draftFromEntry(e),
      canonicalName: "Psoroptes cuniculi",
    });
    expect(diffEntryPatch(builtIn, rename(builtIn))).toEqual({});
    expect(diffEntryPatch(learner, rename(learner))).toEqual({
      canonicalName: "Psoroptes cuniculi",
    });
  });

  it("parses host lists, PPP days and cleared PPP", () => {
    const e = entry();
    const hosts = { ...draftFromEntry(e), definitiveHosts: "sheep, cattle ," };
    expect(diffEntryPatch(e, hosts)).toEqual({
      fields: { definitiveHosts: ["sheep", "cattle"] },
    });
    const ppp = { ...draftFromEntry(e), pppMin: "7", pppMax: "21" };
    expect(diffEntryPatch(e, ppp)).toEqual({
      fields: { pppDays: { min: 7, max: 21 } },
    });
    const cleared = { ...draftFromEntry(e), pppMin: "", pppMax: "" };
    expect(diffEntryPatch(e, cleared)).toEqual({ fields: { pppDays: null } });
  });

  it("keeps diagnostic test windows and drops blank rows", () => {
    const e = entry();
    const base = draftFromEntry(e);
    const draft = {
      ...base,
      diagnosticTests: [
        { ...base.diagnosticTests[0], sample: "" },
        { name: "  ", sample: "x", windowStartWeek: null, windowEndWeek: null },
        { name: "PCR", sample: "", windowStartWeek: null, windowEndWeek: null },
      ],
    };
    expect(diffEntryPatch(e, draft)).toEqual({
      fields: {
        diagnosticTests: [
          { name: "Skin scraping", sample: null, windowStartWeek: 2, windowEndWeek: 6 },
          { name: "PCR", sample: null, windowStartWeek: null, windowEndWeek: null },
        ],
      },
    });
  });
});

describe("withFieldFromEntry", () => {
  const stage = (name: string, diagnostic: boolean) => ({
    name,
    location: null,
    hostRole: null,
    host: null,
    durationDays: null,
    infective: false,
    diagnostic,
    transmission: null,
    note: null,
    imageId: null,
  });

  it("always takes the reset field from the fresh view", () => {
    const e = entry();
    const dirty = { ...draftFromEntry(e), significance: "Unsaved" };
    const fresh = entry({
      fields: { ...e.fields, significance: "Dataset text" },
    });
    expect(withFieldFromEntry(dirty, e, fresh, "significance").significance).toBe(
      "Dataset text",
    );
  });

  it("refreshes untouched keys and keeps the student's other edits", () => {
    const e = entry();
    const dirty = {
      ...draftFromEntry(e),
      significance: "Unsaved",
      pppMin: "1",
    };
    const fresh = entry({
      fields: {
        ...e.fields,
        significance: "Dataset text",
        family: "Psoroptidae",
        pppDays: null,
      },
    });
    const next = withFieldFromEntry(dirty, e, fresh, "lifecycleStages");
    expect(next.significance).toBe("Unsaved");
    expect([next.pppMin, next.pppMax]).toEqual(["1", "14"]);
    expect(next.family).toBe("Psoroptidae");
  });

  it("refreshes both PPP inputs when the student touched neither", () => {
    const e = entry();
    const fresh = entry({ fields: { ...e.fields, pppDays: { min: 3, max: 5 } } });
    const next = withFieldFromEntry(draftFromEntry(e), e, fresh, "significance");
    expect([next.pppMin, next.pppMax]).toEqual(["3", "5"]);
  });

  it("drops a stale diagnosticStage after a lifecycle stages reset", () => {
    const e = entry();
    e.fields.lifecycleStages = [
      stage("egg", true),
    ] as AtlasEntryView["fields"]["lifecycleStages"];
    e.fields.diagnosticStage = "egg";
    const fresh = entry();
    fresh.fields.lifecycleStages = [
      stage("adult", true),
    ] as AtlasEntryView["fields"]["lifecycleStages"];
    fresh.fields.diagnosticStage = "adult";
    const dirty = { ...draftFromEntry(e), vectorRole: "Mechanical" };
    const next = withFieldFromEntry(dirty, e, fresh, "lifecycleStages");
    const patch = diffEntryPatch(fresh, next);
    expect(patch).toEqual({ fields: { vectorRole: "Mechanical" } });
    expect(validateEntryPatch(fresh, patch)).toEqual({});
  });
});

describe("validateEntryPatch", () => {
  it("flags a half-filled PPP on pppDays", () => {
    const e = entry();
    const patch = diffEntryPatch(e, { ...draftFromEntry(e), pppMin: "", pppMax: "9" });
    expect(validateEntryPatch(e, patch)).toEqual({ pppDays: PPP_ERROR });
  });

  it("flags max below min on pppDays", () => {
    const e = entry();
    const patch = diffEntryPatch(e, { ...draftFromEntry(e), pppMin: "9", pppMax: "3" });
    expect(validateEntryPatch(e, patch).pppDays).toBe(PPP_ERROR);
  });

  it("flags empty names and alias limits", () => {
    const e = entry({ originKey: null });
    const many = Array.from({ length: ALIAS_MAX_ITEMS + 1 }, (_, i) => `a${i}`);
    expect(
      validateEntryPatch(e, { commonName: "", canonicalName: "", aliases: many }),
    ).toEqual({
      commonName: "Common name required",
      canonicalName: "Scientific name required",
      aliases: "At most 20 aliases",
    });
    expect(validateEntryPatch(e, { aliases: ["a".repeat(81)] })).toEqual({
      aliases: "Each alias must be 80 characters or fewer",
    });
  });

  it("flags a diagnostic stage that conflicts with the lifecycle flag", () => {
    const e = entry();
    e.fields.lifecycleStages = [
      {
        name: "egg",
        location: null,
        hostRole: null,
        host: null,
        durationDays: null,
        infective: false,
        diagnostic: true,
        transmission: null,
        note: null,
        imageId: null,
      },
    ] as AtlasEntryView["fields"]["lifecycleStages"];
    expect(validateEntryPatch(e, { fields: { diagnosticStage: "adult" } })).toEqual({
      diagnosticStage: DIAGNOSTIC_OWNED_ERROR,
    });
  });

  it("returns no errors for a valid patch", () => {
    const e = entry();
    expect(validateEntryPatch(e, { fields: { significance: "Fine." } })).toEqual({});
  });
});
