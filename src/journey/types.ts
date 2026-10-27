export type { JourneyStatus } from "../api/client";

export type JourneyStageId = "deck" | "material" | "review" | "study";

export type JourneyNextAction =
  | "create_deck"
  | "add_material"
  | "review"
  | "study"
  | "add_more";

export type JourneyView = {
  stages: Array<{
    id: JourneyStageId;
    label: string;
    done: boolean;
    active: boolean;
  }>;
  activeStage: JourneyStageId | null;
  collapsed: boolean;
  next: {
    label: string;
    href: string | null;
    action: JourneyNextAction;
  };
};
