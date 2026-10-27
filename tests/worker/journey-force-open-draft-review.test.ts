import { describe, expect, it } from "vitest";
import { forceOpenDraftReview } from "../../src/journey/forceOpenDraftReview";
import type { JourneyView } from "../../src/journey/types";

function baseView(overrides: Partial<JourneyView> = {}): JourneyView {
  return {
    collapsed: true,
    activeStage: null,
    next: { label: "Start study", href: "/study", action: "study" },
    stages: [
      { id: "deck", label: "Deck", done: true, active: false },
      { id: "material", label: "Material", done: true, active: false },
      { id: "review", label: "Review", done: true, active: false },
      { id: "study", label: "Study", done: true, active: false },
    ],
    ...overrides,
  };
}

describe("forceOpenDraftReview", () => {
  it("forces review active and clears study done + collapsed", () => {
    const view = forceOpenDraftReview(baseView());
    expect(view.collapsed).toBe(false);
    expect(view.activeStage).toBe("review");
    expect(view.stages.find((s) => s.id === "review")).toMatchObject({
      active: true,
      done: false,
    });
    expect(view.stages.find((s) => s.id === "study")).toMatchObject({
      active: false,
      done: false,
    });
    expect(view.next).toMatchObject({
      label: "Review drafts",
      action: "review",
      href: "/study",
    });
  });

  it("sets next href to null when input next href is null", () => {
    const view = forceOpenDraftReview(
      baseView({
        next: { label: "Start study", href: null, action: "study" },
      }),
    );
    expect(view.next.href).toBeNull();
  });

  it("does not throw when next is absent at runtime", () => {
    const withoutNext = {
      ...baseView(),
      next: undefined,
    } as unknown as JourneyView;
    const view = forceOpenDraftReview(withoutNext);
    expect(view.next.href).toBeNull();
  });
});
