import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Deck } from "../api/client";
import type { MissionTileId } from "./MissionBoard";
import { popWorkshop, type WorkshopFrame } from "./workshopStack";

type Args = {
  workshopStack: WorkshopFrame[];
  setWorkshopStack: Dispatch<SetStateAction<WorkshopFrame[]>>;
  resetMaterialMessages: () => void;
  loadStudySummary: (deckId: string, acceptedCount: number) => void;
  clearSelection: () => void;
  refreshMaterials: () => void | Promise<void>;
  onOpenDrafts: () => void;
  deck: Deck | null;
  acceptedCount: number;
};

export function useDeckHubWorkshopNav({
  workshopStack,
  setWorkshopStack,
  resetMaterialMessages,
  loadStudySummary,
  clearSelection,
  refreshMaterials,
  onOpenDrafts,
  deck,
  acceptedCount,
}: Args) {
  const openWorkshop = useCallback(
    (id: MissionTileId) => {
      if (id === "drafts") {
        onOpenDrafts();
        return;
      }
      const frame: WorkshopFrame =
        id === "addMaterial" ? { id: "addMaterial" } : { id };
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
      if (id === "materials") {
        void refreshMaterials();
      }
    },
    [
      acceptedCount,
      clearSelection,
      deck,
      loadStudySummary,
      onOpenDrafts,
      refreshMaterials,
      resetMaterialMessages,
      setWorkshopStack,
    ],
  );

  const onWorkshopBack = useCallback(() => {
    if (workshopStack[workshopStack.length - 1]?.id === "addMaterial") {
      resetMaterialMessages();
    }
    setWorkshopStack((prev) => popWorkshop(prev));
  }, [resetMaterialMessages, setWorkshopStack, workshopStack]);

  const topWorkshop = workshopStack[workshopStack.length - 1] ?? null;

  const workshopTitle = useMemo(() => {
    switch (topWorkshop?.id) {
      case "cards":
        return "Browse cards";
      case "materials":
        return "Browse files";
      case "study":
        return "Study ready";
      default:
        return "";
    }
  }, [topWorkshop?.id]);

  const creatingFlashcards = topWorkshop?.id === "addMaterial";
  const workshopOpen = workshopStack.length > 0 && !creatingFlashcards;

  return {
    topWorkshop,
    workshopTitle,
    workshopOpen,
    creatingFlashcards,
    openWorkshop,
    onWorkshopBack,
  };
}
