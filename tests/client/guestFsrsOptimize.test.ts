import { describe, expect, it } from "vitest";
import type { GuestReviewLog } from "../../src/guest/policyDue";
import { isGuestLogTrainable } from "../../src/guest/policyDue";
import {
  buildGuestFsrsPrefs,
  countGuestTrainableReviews,
  guestFsrsOptimizeStatus,
  guestRevlogCsv,
  nextGuestFsrsPending,
  normalizeGuestFsrsOptimize,
} from "../../src/study/fsrs/guestFsrsOptimize";
import { FSRS_MIN_REVIEWS } from "../../src/study/fsrs/fsrsOptimizeConstants";
import { DEFAULT_STUDY_PREFS } from "../../src/study/policyPrefs";
import { schedulerForPrefs } from "../../src/study/fsrs/fsrsFactory";

function log(
  partial: Partial<GuestReviewLog> & Pick<GuestReviewLog, "cardId" | "rating" | "at">,
): GuestReviewLog {
  return partial;
}

describe("isGuestLogTrainable", () => {
  it("requires finite state", () => {
    expect(
      isGuestLogTrainable(log({ cardId: "a", rating: 3, at: "2026-01-01T00:00:00.000Z" })),
    ).toBe(false);
    expect(
      isGuestLogTrainable(
        log({ cardId: "a", rating: 3, at: "2026-01-01T00:00:00.000Z", state: 0 }),
      ),
    ).toBe(true);
    expect(
      isGuestLogTrainable(
        log({
          cardId: "a",
          rating: 3,
          at: "2026-01-01T00:00:00.000Z",
          state: Number.NaN,
        }),
      ),
    ).toBe(false);
  });
});

describe("countGuestTrainableReviews", () => {
  it("counts enriched only", () => {
    const logs: GuestReviewLog[] = [
      log({ cardId: "a", rating: 1, at: "2026-01-01T00:00:00.000Z" }),
      log({ cardId: "a", rating: 3, at: "2026-01-02T00:00:00.000Z", state: 0 }),
      log({ cardId: "b", rating: 2, at: "2026-01-03T00:00:00.000Z", state: 2 }),
    ];
    expect(countGuestTrainableReviews(logs)).toBe(2);
  });
});

describe("guestRevlogCsv", () => {
  it("skips thin rows and matches account header", () => {
    const csv = guestRevlogCsv([
      log({ cardId: "thin", rating: 1, at: "2026-01-01T00:00:00.000Z" }),
      log({
        cardId: "c1",
        rating: 3,
        at: "2026-01-02T12:00:00.000Z",
        state: 0,
      }),
    ]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "card_id,review_time,review_rating,review_duration,review_state",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      `c1,${Date.parse("2026-01-02T12:00:00.000Z")},3,0,0`,
    );
  });
});

describe("guestFsrsOptimizeStatus / pending", () => {
  it("eligible at floor; pending follows due", () => {
    const enriched = Array.from({ length: FSRS_MIN_REVIEWS }, (_, i) =>
      log({
        cardId: `c${i}`,
        rating: 3,
        at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        state: 0,
      }),
    );
    const thinOnly = [
      log({ cardId: "t", rating: 1, at: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(
      guestFsrsOptimizeStatus(thinOnly, normalizeGuestFsrsOptimize(null)).eligible,
    ).toBe(false);
    expect(
      guestFsrsOptimizeStatus(enriched.slice(0, 399), normalizeGuestFsrsOptimize(null))
        .eligible,
    ).toBe(false);

    const status = guestFsrsOptimizeStatus(
      enriched,
      normalizeGuestFsrsOptimize(null),
    );
    expect(status.eligible).toBe(true);
    expect(status.reviewCount).toBe(FSRS_MIN_REVIEWS);
    expect(status.pending).toBe(false);

    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(
      nextGuestFsrsPending(enriched, normalizeGuestFsrsOptimize(null), now),
    ).toBe(true);
    expect(
      nextGuestFsrsPending(
        enriched,
        normalizeGuestFsrsOptimize({
          fsrsLastOptimizedAt: "2026-05-20T00:00:00.000Z",
        }),
        now,
      ),
    ).toBe(false);
    expect(
      nextGuestFsrsPending(
        enriched,
        normalizeGuestFsrsOptimize({
          fsrsLastOptimizedAt: "2026-04-01T00:00:00.000Z",
        }),
        now,
      ),
    ).toBe(true);
  });

  it("normalize rejects bad w", () => {
    expect(normalizeGuestFsrsOptimize({ fsrsW: [1, 2] }).fsrsW).toBeNull();
    const w = Array.from({ length: 34 }, () => 0.5);
    expect(normalizeGuestFsrsOptimize({ fsrsW: w }).fsrsW).toEqual(w);
  });

  it("buildGuestFsrsPrefs passes validated w into schedulerForPrefs", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    const w = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    const prefs = buildGuestFsrsPrefs(
      { ...DEFAULT_STUDY_PREFS, enableFuzz: false },
      w,
    );
    const withCustom = await schedulerForPrefs(prefs);
    const withDefault = await schedulerForPrefs({
      desiredRetention: DEFAULT_STUDY_PREFS.desiredRetention,
      enableFuzz: false,
    });
    expect(withCustom.config.weights[2]).not.toBe(
      withDefault.config.weights[2],
    );
  });
});
