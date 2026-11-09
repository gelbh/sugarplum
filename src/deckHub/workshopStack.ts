export type WorkshopId =
  | "addMaterial"
  | "drafts"
  | "cards"
  | "createCard"
  | "study";

export type WorkshopFrame = {
  id: WorkshopId;
  tab?: "upload" | "paste" | "topic" | "diy";
};

export function pushWorkshop(
  stack: readonly WorkshopFrame[],
  frame: WorkshopFrame,
): WorkshopFrame[] {
  if (frame.id === "createCard") {
    const top = stack[stack.length - 1];
    if (!top || top.id !== "cards") {
      throw new Error("createCard may only sit above cards");
    }
  }
  return [...stack, frame];
}

export function popWorkshop(
  stack: readonly WorkshopFrame[],
): WorkshopFrame[] {
  if (stack.length === 0) return [];
  return stack.slice(0, -1);
}

export function replaceWorkshop(
  stack: readonly WorkshopFrame[],
  frame: WorkshopFrame,
): WorkshopFrame[] {
  if (stack.length === 0) return [frame];
  return [...stack.slice(0, -1), frame];
}
