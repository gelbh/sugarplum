import type { Dispatch, SetStateAction } from "react";
import type { WorkshopFrame } from "./workshopStack";

export type DeckHubWorkshopOpenersCtx = {
  resetMaterialMessages: () => void;
  prepareCreateFrame: () => void;
  setWorkshopStack: Dispatch<SetStateAction<WorkshopFrame[]>>;
};

export function createDeckHubWorkshopOpeners(ctx: DeckHubWorkshopOpenersCtx) {
  const { resetMaterialMessages, prepareCreateFrame, setWorkshopStack } = ctx;

  function openUploadFromMaterials() {
    resetMaterialMessages();
    setWorkshopStack([
      { id: "materials" },
      { id: "addMaterial", tab: "upload" },
    ]);
  }

  function openDiyFromCards() {
    prepareCreateFrame();
    resetMaterialMessages();
    setWorkshopStack([{ id: "cards" }, { id: "addMaterial", tab: "diy" }]);
  }

  return { openUploadFromMaterials, openDiyFromCards };
}
