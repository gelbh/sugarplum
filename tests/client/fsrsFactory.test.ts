import { describe, expect, it, beforeEach } from "vitest";
import {
  clampLearningStep,
  clearSchedulerCache,
  schedulerForPrefs,
} from "../../src/study/fsrs/fsrsFactory";
import { cardFromScheduleRow } from "../../src/study/fsrs/retrievability";
import { State } from "ts-fsrs";

describe("schedulerForPrefs", () => {
  beforeEach(() => {
    clearSchedulerCache();
  });

  it("sets desiredRetention and enableFuzz from prefs", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.85,
      enableFuzz: false,
    });
    expect(f.config.desiredRetention[3]).toBe(0.85);
    expect(f.config.enableFuzz).toBe(false);
    expect(f.schedulerDefinition?.model?.name ?? f.model).toBeTruthy();
  });

  it("defaults match StudyPrefs defaults when omitted via DEFAULT", async () => {
    const f = await schedulerForPrefs();
    expect(f.config.desiredRetention[3]).toBe(0.9);
    expect(f.config.enableFuzz).toBe(true);
  });

  it("passes custom w into scheduler config", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    const w = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    const withCustom = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
      w,
    });
    const withDefault = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    expect(withCustom.config.weights).toHaveLength(34);
    expect(withCustom.config.weights[2]).not.toBe(
      withDefault.config.weights[2],
    );
  });

  it("omits invalid w and keeps library default length 34", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
      w: [1, 2, 3],
    });
    expect(f.config.weights).toHaveLength(34);
  });

  it("uses FSRS-7 by default", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    expect(f.schedulerDefinition.model.name).toBe("fsrs-7");
  });

  it("uses single 10m learning and relearning steps", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    expect(f.config.learningSteps).toEqual(["10m"]);
    expect(f.config.relearningSteps).toEqual(["10m"]);
  });

  it("Again on a new card is due in about 10 minutes", async () => {
    const { Rating } = await import("ts-fsrs");
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const now = new Date("2026-11-13T12:00:00.000Z");
    const card = f.newCard({ now });
    const { card: next } = f.review({ card, grade: Rating.Again, now });
    const deltaMin = (next.dueAt.getTime() - now.getTime()) / 60_000;
    expect(deltaMin).toBe(10);
  });

  it("clampLearningStep caps out-of-range persisted steps", () => {
    expect(clampLearningStep(1)).toBe(0);
    expect(clampLearningStep(0)).toBe(0);
    expect(clampLearningStep(-3)).toBe(0);
  });

  it("Again after legacy learningStep 1 stays ~10m via cardFromScheduleRow", async () => {
    const { Rating } = await import("ts-fsrs");
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const now = new Date("2026-11-13T12:00:00.000Z");
    const card = cardFromScheduleRow({
      card_id: "legacy-step1",
      due: now.toISOString(),
      stability: 0.5,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 1,
      reps: 2,
      lapses: 0,
      state: State.Learning,
      last_review: now.toISOString(),
      stability_fast: 0.4,
    });
    expect(card.learningStep).toBe(0);
    const { card: next } = f.review({
      card: card as never,
      grade: Rating.Again,
      now,
    });
    const deltaMin = (next.dueAt.getTime() - now.getTime()) / 60_000;
    expect(deltaMin).toBe(10);
  });
});
