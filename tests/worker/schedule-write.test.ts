import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import {
  prepareDueOnlyUpdate,
  prepareFullScheduleUpdate,
  ratingToGrade,
} from "../../worker/study/scheduleWrite";

function captureDb() {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, binds: args });
          return {};
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe("ratingToGrade", () => {
  it("maps 1..4 to Again/Hard/Good/Easy", () => {
    expect(ratingToGrade(1)).toBe(Rating.Again);
    expect(ratingToGrade(2)).toBe(Rating.Hard);
    expect(ratingToGrade(3)).toBe(Rating.Good);
    expect(ratingToGrade(4)).toBe(Rating.Easy);
  });

  it("returns null for out-of-range ratings", () => {
    expect(ratingToGrade(0)).toBeNull();
    expect(ratingToGrade(5)).toBeNull();
    expect(ratingToGrade(3.5)).toBeNull();
  });
});

describe("prepare schedule updates", () => {
  const cols = {
    due: "2026-01-02T00:00:00.000Z",
    stability: 1.2,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 2,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state: 2,
    last_review: "2026-01-01T00:00:00.000Z",
  };

  it("prepareFullScheduleUpdate binds cols, cardId, userId and ownership EXISTS", () => {
    const { db, calls } = captureDb();
    prepareFullScheduleUpdate(db, cols, "card-1", "user-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("UPDATE card_schedules SET");
    expect(calls[0]!.sql).toContain("EXISTS");
    expect(calls[0]!.sql).toContain("d.user_id = ?");
    expect(calls[0]!.binds).toEqual([
      cols.due,
      cols.stability,
      cols.difficulty,
      cols.elapsed_days,
      cols.scheduled_days,
      cols.learning_steps,
      cols.reps,
      cols.lapses,
      cols.state,
      cols.last_review,
      null,
      "card-1",
      "user-1",
    ]);
  });

  it("prepareDueOnlyUpdate binds due, cardId, userId and ownership EXISTS", () => {
    const { db, calls } = captureDb();
    prepareDueOnlyUpdate(db, "2026-01-03T00:00:00.000Z", "card-2", "user-2");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("UPDATE card_schedules SET due = ?");
    expect(calls[0]!.sql).toContain("EXISTS");
    expect(calls[0]!.binds).toEqual([
      "2026-01-03T00:00:00.000Z",
      "card-2",
      "user-2",
    ]);
  });
});
