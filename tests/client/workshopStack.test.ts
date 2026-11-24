import { describe, expect, it } from "vitest";
import {
  popWorkshop,
  pushWorkshop,
  replaceWorkshop,
  type WorkshopFrame,
} from "../../src/deckHub/workshop/workshopStack";

describe("workshopStack", () => {
  it("pushes cards then diy addMaterial for Browse Create", () => {
    const s = pushWorkshop([{ id: "cards" }], {
      id: "addMaterial",
      tab: "diy",
    });
    expect(s).toEqual([{ id: "cards" }, { id: "addMaterial", tab: "diy" }]);
  });

  it("replace swaps the top frame", () => {
    const s = replaceWorkshop([{ id: "addMaterial" }], { id: "cards" });
    expect(s).toEqual([{ id: "cards" }]);
  });

  it("pushes a new frame onto an empty stack", () => {
    const s = pushWorkshop([], { id: "addMaterial", tab: "upload" });
    expect(s).toEqual([{ id: "addMaterial", tab: "upload" }]);
  });

  it("pops the top frame", () => {
    const base: WorkshopFrame[] = [
      { id: "cards" },
      { id: "addMaterial", tab: "diy" },
    ];
    expect(popWorkshop(base).map((f) => f.id)).toEqual(["cards"]);
  });

  it("pop on empty stack returns empty", () => {
    expect(popWorkshop([])).toEqual([]);
  });

  it("replace on empty stack sets the frame", () => {
    expect(replaceWorkshop([], { id: "study" })).toEqual([{ id: "study" }]);
  });

  it("does not mutate the input stack", () => {
    const base: WorkshopFrame[] = [{ id: "cards" }];
    const next = pushWorkshop(base, { id: "addMaterial", tab: "diy" });
    expect(base).toEqual([{ id: "cards" }]);
    expect(next).not.toBe(base);
  });
});
