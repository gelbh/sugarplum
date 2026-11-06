import { describe, expect, it } from "vitest";
import { rememberUnlocks } from "../../src/achievements/rememberUnlocks";

describe("rememberUnlocks", () => {
  it("dedupes unlocks by id and keeps earlier ones", () => {
    const first = {
      id: "a",
      title: "Apple",
      fruitType: "apple" as const,
      rarity: "common" as const,
      traits: { shine: "mild" as const, colour: "#5B2C6F", status: "ripe" },
    };
    const again = { ...first, title: "Apple again" };
    const second = { ...first, id: "b", title: "Plum", fruitType: "plum" as const };
    const prev = [first];
    expect(rememberUnlocks(prev, [again, second])).toEqual([first, second]);
    expect(rememberUnlocks(prev, [])).toBe(prev);
  });
});
