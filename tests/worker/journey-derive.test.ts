import { describe, it, expect } from "vitest";
import type { JourneyStatus } from "../../src/api/client";
import { deriveJourney } from "../../src/journey/derive";

function status(overrides: Partial<JourneyStatus> = {}): JourneyStatus {
  return {
    deckCount: 0,
    hasGenerationJob: false,
    openReviewJobId: null,
    acceptedCount: 0,
    dueCount: 0,
    ...overrides,
  };
}

describe("deriveJourney", () => {
  it("zero decks: deck active, create_deck next", () => {
    const view = deriveJourney(status());
    expect(view.collapsed).toBe(false);
    expect(view.activeStage).toBe("deck");
    expect(view.stages.find((s) => s.id === "deck")).toMatchObject({
      done: false,
      active: true,
      label: "Deck",
    });
    expect(view.next).toEqual({
      label: "Create a deck",
      href: null,
      action: "create_deck",
    });
  });

  it("decks only: material active, add_material next", () => {
    const view = deriveJourney(status({ deckCount: 2 }));
    expect(view.activeStage).toBe("material");
    expect(view.stages.find((s) => s.id === "deck")?.done).toBe(true);
    expect(view.stages.find((s) => s.id === "material")?.active).toBe(true);
    expect(view.next).toEqual({
      label: "Add material",
      href: null,
      action: "add_material",
    });
  });

  it("has job + open review: review active, drafts link", () => {
    const view = deriveJourney(
      status({
        deckCount: 1,
        hasGenerationJob: true,
        openReviewJobId: "job-abc",
      }),
    );
    expect(view.activeStage).toBe("review");
    expect(view.stages.find((s) => s.id === "material")?.done).toBe(true);
    expect(view.stages.find((s) => s.id === "review")?.done).toBe(false);
    expect(view.next).toEqual({
      label: "Review drafts",
      href: "/jobs/job-abc/drafts",
      action: "review",
    });
  });

  it("review clear, study incomplete, due cards: Start study", () => {
    const view = deriveJourney(
      status({
        deckCount: 1,
        hasGenerationJob: true,
        openReviewJobId: null,
        acceptedCount: 0,
        dueCount: 3,
      }),
    );
    expect(view.activeStage).toBe("study");
    expect(view.stages.find((s) => s.id === "review")?.done).toBe(true);
    expect(view.stages.find((s) => s.id === "study")?.done).toBe(false);
    expect(view.next).toEqual({
      label: "Start study",
      href: "/study",
      action: "study",
    });
  });

  it("study stage with zero due: Go to Today", () => {
    const view = deriveJourney(
      status({
        deckCount: 1,
        hasGenerationJob: true,
        openReviewJobId: null,
        acceptedCount: 0,
        dueCount: 0,
      }),
    );
    expect(view.activeStage).toBe("study");
    expect(view.next).toEqual({
      label: "Go to Today",
      href: "/today",
      action: "study",
    });
  });

  it("all stages done: collapsed, add_more next", () => {
    const view = deriveJourney(
      status({
        deckCount: 1,
        hasGenerationJob: true,
        openReviewJobId: null,
        acceptedCount: 10,
        dueCount: 5,
      }),
    );
    expect(view.collapsed).toBe(true);
    expect(view.activeStage).toBe(null);
    expect(view.stages.every((s) => s.done)).toBe(true);
    expect(view.stages.every((s) => !s.active)).toBe(true);
    expect(view.next).toEqual({
      label: "Add more material",
      href: "/library",
      action: "add_more",
    });
  });

  it("review not done when never generated", () => {
    const view = deriveJourney(status({ deckCount: 1 }));
    expect(view.stages.find((s) => s.id === "review")?.done).toBe(false);
  });
});
