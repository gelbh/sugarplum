import { describe, expect, it } from "vitest";
import { subjectAtlasAction } from "../../src/atlas/subjectAtlasAction";

describe("subjectAtlasAction", () => {
  it("asks guests to sign in", () => {
    expect(subjectAtlasAction(true, false)).toEqual({
      kind: "sign-in",
      label: "Sign in to add a Parasitology Atlas",
    });
    expect(subjectAtlasAction(true, true).kind).toBe("sign-in");
  });

  it("offers Add when signed in without an Atlas", () => {
    expect(subjectAtlasAction(false, false)).toEqual({
      kind: "add",
      label: "Add Parasitology Atlas",
    });
  });

  it("links to the Atlas when one exists", () => {
    expect(subjectAtlasAction(false, true)).toEqual({
      kind: "open",
      label: "Parasitology Atlas",
    });
  });
});
