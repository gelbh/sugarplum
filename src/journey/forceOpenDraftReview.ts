import type { JourneyView } from "./types";

/** When open drafts exist, Review is the active gate; Study must not look finished. */
export function forceOpenDraftReview(view: JourneyView): JourneyView {
  return {
    ...view,
    collapsed: false,
    activeStage: "review",
    next: {
      label: "Review drafts",
      href: view.next?.href ?? null,
      action: "review",
    },
    stages: view.stages.map((s) => {
      if (s.id === "review") return { ...s, active: true, done: false };
      if (s.id === "study") return { ...s, active: false, done: false };
      return { ...s, active: false };
    }),
  };
}
