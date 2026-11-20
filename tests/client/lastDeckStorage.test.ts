import { describe, expect, it } from "vitest";
import { lastDeckStorageKey } from "../../src/atlas/hub/lastDeckStorage";

describe("lastDeckStorage", () => {
  it("keys last deck by atlas id", () => {
    expect(lastDeckStorageKey("atlas-1")).toBe(
      "sugarplum.atlas.lastDeck.atlas-1",
    );
  });
});
