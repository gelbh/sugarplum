import type { JourneyStatus } from "../api/client";
import type { JourneyStageId, JourneyView } from "./types";

const STAGE_ORDER: JourneyStageId[] = [
  "deck",
  "material",
  "review",
  "study",
];

const STAGE_LABELS: Record<JourneyStageId, string> = {
  deck: "Deck",
  material: "Material",
  review: "Review",
  study: "Study",
};

function stageDone(id: JourneyStageId, status: JourneyStatus): boolean {
  switch (id) {
    case "deck":
      return status.deckCount > 0;
    case "material":
      return status.hasGenerationJob;
    case "review":
      return status.hasGenerationJob && status.openReviewJobId === null;
    case "study":
      return status.acceptedCount > 0;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function nextForStage(
  activeStage: JourneyStageId,
  status: JourneyStatus,
): JourneyView["next"] {
  switch (activeStage) {
    case "deck":
      return {
        label: "Create a deck",
        href: null,
        action: "create_deck",
      };
    case "material":
      return {
        label: "Add material",
        href: null,
        action: "add_material",
      };
    case "review":
      return {
        label: "Review drafts",
        href: `/jobs/${status.openReviewJobId}/drafts`,
        action: "review",
      };
    case "study":
      if (status.dueCount > 0) {
        return { label: "Start study", href: "/study", action: "study" };
      }
      return { label: "Go to Today", href: "/today", action: "study" };
    default: {
      const _exhaustive: never = activeStage;
      return _exhaustive;
    }
  }
}

export function deriveJourney(status: JourneyStatus): JourneyView {
  const doneByStage = Object.fromEntries(
    STAGE_ORDER.map((id) => [id, stageDone(id, status)]),
  ) as Record<JourneyStageId, boolean>;

  const collapsed = STAGE_ORDER.every((id) => doneByStage[id]);
  const activeStage = collapsed
    ? null
    : (STAGE_ORDER.find((id) => !doneByStage[id]) ?? null);

  const stages = STAGE_ORDER.map((id) => ({
    id,
    label: STAGE_LABELS[id],
    done: doneByStage[id],
    active: id === activeStage,
  }));

  const next = collapsed
    ? {
        label: "Add more material",
        href: "/library",
        action: "add_more" as const,
      }
    : nextForStage(activeStage!, status);

  return { stages, activeStage, collapsed, next };
}
