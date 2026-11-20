/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  ATLAS_PREVIEW_KEY,
  syncAtlasPreviewParam,
} from "../../src/atlas/hub/preview";
import { matchAtlasPath } from "../../src/atlas/paths";

describe("syncAtlasPreviewParam", () => {
  afterEach(() => localStorage.clear());

  it("sets the flag, strips the param and keeps history state", () => {
    window.history.replaceState(
      { key: "k1" },
      "",
      "/library?atlasPreview=1&x=2",
    );
    syncAtlasPreviewParam();
    expect(localStorage.getItem(ATLAS_PREVIEW_KEY)).toBe("1");
    expect(window.location.pathname + window.location.search).toBe(
      "/library?x=2",
    );
    expect(window.history.state).toEqual({ key: "k1" });
  });

  it("clears the flag with atlasPreview=0", () => {
    localStorage.setItem(ATLAS_PREVIEW_KEY, "1");
    window.history.replaceState(null, "", "/today?atlasPreview=0");
    syncAtlasPreviewParam();
    expect(localStorage.getItem(ATLAS_PREVIEW_KEY)).toBeNull();
    expect(window.location.search).toBe("");
  });
});

describe("matchAtlasPath", () => {
  it("parses hub, cabinet, entry and compare paths", () => {
    expect(matchAtlasPath("/atlas")).toEqual({ kind: "hub" });
    expect(matchAtlasPath("/atlas/a1")).toEqual({
      kind: "atlas",
      atlasId: "a1",
      route: { kind: "cabinet" },
    });
    expect(matchAtlasPath("/atlas/a1/entry/fasciola-hepatica/")).toEqual({
      kind: "atlas",
      atlasId: "a1",
      route: { kind: "entry", key: "fasciola-hepatica" },
    });
    expect(matchAtlasPath("/atlas/a1/compare/a/b")).toEqual({
      kind: "atlas",
      atlasId: "a1",
      route: { kind: "compare", a: "a", b: "b" },
    });
  });

  it("treats old Library atlas URLs as legacy redirects", () => {
    expect(matchAtlasPath("/library/subjects/s1/atlas")).toEqual({
      kind: "legacy",
      subjectId: "s1",
      route: { kind: "cabinet" },
    });
    expect(
      matchAtlasPath("/library/subjects/s1/atlas/entry/fasciola-hepatica/"),
    ).toEqual({
      kind: "legacy",
      subjectId: "s1",
      route: { kind: "entry", key: "fasciola-hepatica" },
    });
  });

  it("rejects malformed atlas paths and the plain subject path", () => {
    expect(matchAtlasPath("/library/subjects/s1")).toBeNull();
    expect(matchAtlasPath("/atlas/a1/entry/a/b")).toBeNull();
    expect(matchAtlasPath("/atlas/a1/compare/a")).toBeNull();
  });
});
