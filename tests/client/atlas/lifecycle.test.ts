import { describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../../src/atlas/hub/bundledSource";
import {
  axis,
  buildLanes,
  detectableWindows,
  durationLabel,
  lifecycleModel,
  pppBracket,
  stageIsDiagnostic,
  stageLanes,
  stageSpan,
  windowLit,
} from "../../../src/atlas/lifecycle/lifecycle";

const entries = await bundledAtlasSource.list("subj_1");
const fields = (id: string) => entries.find((e) => e.id === id)!.fields;

describe("buildLanes", () => {
  it("gives Fasciola one lane per host role in first-appearance order", () => {
    const f = fields("fasciola-hepatica");
    const lanes = buildLanes(f);
    expect(lanes.map((l) => l.role)).toEqual([
      "environment",
      "intermediate",
      "definitive",
    ]);
    expect(lanes[2].hosts).toEqual(["sheep", "cattle", "goat"]);
    expect(lanes[2].more).toBe(3);
    // Environment comes back after the snail stages but stays one lane.
    expect(stageLanes(f, lanes)).toEqual([0, 0, 1, 1, 0, 0, 2, 2]);
  });

  it("splits sequential intermediate hosts into their own lanes", () => {
    for (const id of ["clonorchis-sinensis", "diphyllobothrium-latum"]) {
      const intermediate = buildLanes(fields(id)).filter(
        (l) => l.role === "intermediate",
      );
      expect(intermediate).toHaveLength(2);
      expect(intermediate.every((l) => l.hosts.length === 1)).toBe(true);
    }
  });

  it("puts role-less stages in a final Unassigned lane", () => {
    const f = structuredClone(fields("fasciola-hepatica"));
    f.lifecycleStages[0].hostRole = null;
    const lanes = buildLanes(f);
    expect(lanes.at(-1)?.title).toBe("Unassigned");
    expect(stageLanes(f, lanes)[0]).toBe(lanes.length - 1);
  });
});

describe("axis", () => {
  it("keeps a 56-day span in days", () => {
    const ax = axis(fields("fasciola-hepatica"))!;
    expect(ax.unit).toBe("days");
    expect(ax.endDay).toBe(70);
    expect(ax.ticks.map((t) => t.day)).toEqual([0, 14, 28, 42, 56, 70]);
  });

  it("puts every axis at 5 to 7 ticks past its last value", () => {
    for (const e of entries) {
      const ax = axis(e.fields);
      if (!ax) continue;
      expect(ax.ticks.length, e.id).toBeGreaterThanOrEqual(5);
      expect(ax.ticks.length, e.id).toBeLessThanOrEqual(7);
      expect(ax.endDay, e.id).toBeGreaterThan(e.fields.pppDays?.max ?? 0);
    }
  });

  it("switches to weeks past 56 days", () => {
    const ax = axis(fields("fascioloides-magna"))!;
    expect(ax.unit).toBe("weeks");
    expect(ax.endDay).toBeGreaterThanOrEqual(210);
    expect(ax.ticks.length).toBeGreaterThanOrEqual(5);
    expect(ax.ticks.length).toBeLessThanOrEqual(7);
  });

  it("builds the axis from test windows alone when there is no PPP", () => {
    // Study-floor catalog now fills PPP for helminths; keep a null-PPP fixture
    // so this axis path stays covered.
    const f = { ...fields("taenia-saginata"), pppDays: null };
    expect(f.pppDays).toBeNull();
    const model = lifecycleModel(f);
    expect(model.axis?.unit).toBe("weeks");
    expect(model.axis!.endDay).toBeGreaterThanOrEqual(91);
    expect(model.ppp).toBeNull();
  });

  it("gives an open-ended window room when there is no PPP", () => {
    const f = { ...fields("fasciola-gigantica"), pppDays: null };
    expect(f.pppDays).toBeNull();
    const ax = axis(f)!;
    const [w] = detectableWindows(f, ax);
    expect(w.openEnded).toBe(true);
    expect(w.endDay - w.startDay).toBeGreaterThanOrEqual(28);
  });

  it("marks entries with no PPP and no windows as untimed", () => {
    const model = lifecycleModel(fields("pulex-irritans"));
    expect(model.timed).toBe(false);
    expect(model.axis).toBeNull();
    expect(model.windows).toEqual([]);
  });
});

describe("pppBracket and durationLabel", () => {
  it("labels a PPP range", () => {
    expect(pppBracket(fields("dipylidium-caninum"))).toEqual({
      endDay: 14,
      label: "PPP 14 to 21 days",
    });
  });

  it("uses days below two weeks and weeks from there", () => {
    expect(durationLabel({ min: 13, max: 13 })).toBe("about 13 days");
    expect(durationLabel({ min: 14, max: 14 })).toBe("about 2 weeks");
    expect(durationLabel({ min: 1, max: 1 })).toBe("about 1 day");
    expect(durationLabel({ min: 10, max: 21 })).toBe("about 1 to 3 weeks");
    expect(durationLabel({ min: 1, max: 21 })).toBe("about 1 to 3 weeks");
  });
});

describe("stageIsDiagnostic", () => {
  it("reads the hydrated stage flag only", () => {
    const f = fields("fasciola-hepatica");
    expect(f.lifecycleStages[0].diagnostic).toBe(true);
    expect(stageIsDiagnostic(f.lifecycleStages[0])).toBe(true);
    expect(stageIsDiagnostic(f.lifecycleStages[5])).toBe(false);
    expect(
      stageIsDiagnostic({ ...f.lifecycleStages[5], diagnostic: true }),
    ).toBe(true);
  });

  it("marks infective and transmission on the Fasciola pilot", () => {
    const f = fields("fasciola-hepatica");
    expect(f.lifecycleStages[5].infective).toBe(true);
    expect(f.lifecycleStages[5].transmission).toBe(
      "encysts on aquatic vegetation",
    );
  });
});

describe("detectable windows", () => {
  it("runs an open-ended antibody window to the axis end", () => {
    const f = fields("fasciola-hepatica");
    const ax = axis(f)!;
    expect(detectableWindows(f, ax)).toEqual([
      {
        name: "antibody detection",
        sample: "serum",
        startDay: 14,
        endDay: ax.endDay,
        openEnded: true,
      },
    ]);
  });

  it("lights a window only from a definitive-host stage inside it", () => {
    const f = fields("fasciola-hepatica");
    const ax = axis(f)!;
    const [antibody] = detectableWindows(f, ax);
    expect(stageSpan(f, 0, ax)).toBeNull();
    expect(stageSpan(f, 6, ax)).toEqual({ startDay: 0, endDay: 56 });
    expect(stageSpan(f, 7, ax)).toEqual({ startDay: 56, endDay: 70 });
    expect(windowLit(antibody, stageSpan(f, 6, ax))).toBe(true);
    expect(windowLit(antibody, stageSpan(f, 7, ax))).toBe(true);
    expect(windowLit(antibody, stageSpan(f, 0, ax))).toBe(false);
  });
});
