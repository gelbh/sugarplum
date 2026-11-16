import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Deck } from "../api/client";
import type { MissionTileId } from "./MissionBoard";
import {
  popWorkshop,
  replaceWorkshop,
  type WorkshopFrame,
} from "./workshopStack";

type Args = {
  workshopStack: WorkshopFrame[];
  setWorkshopStack: Dispatch<SetStateAction<WorkshopFrame[]>>;
  materialTab: NonNullable<WorkshopFrame["tab"]>;
  resetMaterialMessages: () => void;
  loadStudySummary: (deckId: string, acceptedCount: number) => void;
  clearSelection: () => void;
  deck: Deck | null;
  acceptedCount: number;
};

export function useDeckHubWorkshopNav({
  workshopStack,
  setWorkshopStack,
  materialTab,
  resetMaterialMessages,
  loadStudySummary,
  clearSelection,
  deck,
  acceptedCount,
}: Args) {
  const openWorkshop = useCallback(
    (id: MissionTileId) => {
      const frame: WorkshopFrame =
        id === "addMaterial"
          ? { id: "addMaterial", tab: materialTab }
          : { id };
      setWorkshopStack([frame]);
      if (id === "addMaterial") {
        resetMaterialMessages();
      }
      if (id === "study" && deck) {
        loadStudySummary(deck.id, acceptedCount);
      }
      if (id === "cards") {
        clearSelection();
      }
    },
    [
      acceptedCount,
      clearSelection,
      deck,
      loadStudySummary,
      materialTab,
      resetMaterialMessages,
      setWorkshopStack,
    ],
  );

  const onWorkshopBack = useCallback(() => {
    setWorkshopStack((prev) => popWorkshop(prev));
  }, [setWorkshopStack]);

  const jumpWorkshop = useCallback(
    (frame: WorkshopFrame) => {
      setWorkshopStack((prev) => replaceWorkshop(prev, frame));
    },
    [setWorkshopStack],
  );

  const topWorkshop = workshopStack[workshopStack.length - 1] ?? null;

  const workshopTitle = useMemo(() => {
    switch (topWorkshop?.id) {
      case "addMaterial":
        return "Add material";
      case "drafts":
        return "Review drafts";
      case "cards":
        return "Browse cards";
      case "createCard":
        return "Create card";
      case "study":
        return "Study ready";
      default:
        return "";
    }
  }, [topWorkshop?.id]);

  const workshopOpen = workshopStack.length > 0;

  return {
    topWorkshop,
    workshopTitle,
    workshopOpen,
    openWorkshop,
    onWorkshopBack,
    jumpWorkshop,
  };
}
