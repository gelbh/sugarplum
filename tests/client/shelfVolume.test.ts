import { describe, expect, it } from "vitest";
import { libraryShowsCreateFlow } from "../../src/library/libraryCreateFlow";

describe("libraryShowsCreateFlow", () => {
  it("opens the wizard only when there are no subjects", () => {
    expect(libraryShowsCreateFlow(0)).toBe(true);
    expect(libraryShowsCreateFlow(1)).toBe(false);
  });
});
