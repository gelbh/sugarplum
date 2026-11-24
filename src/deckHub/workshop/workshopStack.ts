export type WorkshopId = "addMaterial" | "cards" | "materials" | "study";

export type WorkshopFrame = {
  id: WorkshopId;
  tab?: "upload" | "paste" | "diy";
};

export function pushWorkshop(
  stack: readonly WorkshopFrame[],
  frame: WorkshopFrame,
): WorkshopFrame[] {
  return [...stack, frame];
}

export function popWorkshop(stack: readonly WorkshopFrame[]): WorkshopFrame[] {
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
