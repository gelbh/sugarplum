import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PILL_BTN,
  ROW_ACTION,
  WORKSHOP_SURFACE,
  createWorkshopViewPref,
} from "../../src/deckHub/workshopChrome";

describe("workshopChrome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports shared pill and row action chrome", () => {
    expect(PILL_BTN.borderRadius).toBe(999);
    expect(PILL_BTN.textTransform).toBe("none");
    expect(PILL_BTN.fontWeight).toBe(600);
    expect(PILL_BTN.boxShadow).toBe("none");
    expect(PILL_BTN["&:hover"]).toEqual({ boxShadow: "none" });

    expect(ROW_ACTION.color).toBe("rgba(232, 216, 199, 0.55)");
    expect(ROW_ACTION["&:hover"]).toEqual({
      color: "primary.light",
      bgcolor: "rgba(91, 44, 111, 0.28)",
    });

    expect(WORKSHOP_SURFACE.borderRadius).toBe(2);
    expect(WORKSHOP_SURFACE.borderColor).toBe("rgba(232, 216, 199, 0.12)");
  });

  it("round-trips view mode per storage key", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });

    const cards = createWorkshopViewPref("sugarplum.cardsWorkshop.view");
    const materials = createWorkshopViewPref(
      "sugarplum.materialsWorkshop.view",
    );

    expect(cards.readViewMode()).toBe("icons");
    expect(materials.readViewMode()).toBe("icons");

    cards.writeViewMode("details");
    expect(cards.readViewMode()).toBe("details");
    expect(materials.readViewMode()).toBe("icons");
    expect(store.get("sugarplum.cardsWorkshop.view")).toBe("details");

    materials.writeViewMode("details");
    expect(materials.readViewMode()).toBe("details");
    expect(store.get("sugarplum.materialsWorkshop.view")).toBe("details");
  });

  it("ignores unknown stored values", () => {
    const store = new Map<string, string>([["k", "grid"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });

    expect(createWorkshopViewPref("k").readViewMode()).toBe("icons");
  });
});
