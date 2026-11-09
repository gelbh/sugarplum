import { describe, expect, it } from "vitest";
import {
  popWorkshop,
  pushWorkshop,
  replaceWorkshop,
  type WorkshopFrame,
} from "../../src/deckHub/workshopStack";

describe("workshopStack", () => {
  it("pushes createCard only onto cards", () => {
    const s = pushWorkshop([{ id: "cards" }], { id: "createCard" });
    expect(s.map((f) => f.id)).toEqual(["cards", "createCard"]);
  });

  it("rejects createCard without cards base", () => {
    expect(() => pushWorkshop([], { id: "createCard" })).toThrow();
  });

  it("rejects createCard when top is not cards", () => {
    expect(() =>
      pushWorkshop([{ id: "addMaterial" }], { id: "createCard" }),
    ).toThrow();
  });

  it("replace swaps top frame for Add→Drafts jump", () => {
    const s = replaceWorkshop([{ id: "addMaterial" }], { id: "drafts" });
    expect(s).toEqual([{ id: "drafts" }]);
  });

  it("pushes a new frame onto an empty stack", () => {
    const s = pushWorkshop([], { id: "addMaterial", tab: "upload" });
    expect(s).toEqual([{ id: "addMaterial", tab: "upload" }]);
  });

  it("pops the top frame", () => {
    const base: WorkshopFrame[] = [
      { id: "cards" },
      { id: "createCard" },
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
    const next = pushWorkshop(base, { id: "createCard" });
    expect(base).toEqual([{ id: "cards" }]);
    expect(next).not.toBe(base);
  });
});
