import { describe, expect, it } from "vitest";
import {
  createStructureUiState,
  structureUiReducer,
} from "../../src/anatomy/structureState";

describe("structureUiReducer", () => {
  it("isolates one structure and clears on showAll", () => {
    let s = createStructureUiState();
    s = structureUiReducer(s, { type: "isolate", id: "bone-a" });
    expect(s.isolatedId).toBe("bone-a");
    s = structureUiReducer(s, { type: "showAll" });
    expect(s.isolatedId).toBeNull();
    expect(s.hidden.size).toBe(0);
  });

  it("toggles hidden without dropping selection", () => {
    let s = createStructureUiState();
    s = structureUiReducer(s, { type: "select", id: "bone-a" });
    s = structureUiReducer(s, { type: "toggleHidden", id: "bone-a" });
    expect(s.selectedId).toBe("bone-a");
    expect(s.hidden.has("bone-a")).toBe(true);
  });
});
