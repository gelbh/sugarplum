/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentEntryKey,
  goShellBack,
  locationKey,
  navigate,
  navigateReplace,
  shellBackHref,
  subscribeLocation,
  subscribePath,
} from "../../src/shared/nav/navigate";

describe("navigate", () => {
  it("pushState updates path subscribers", () => {
    const paths: string[] = [];
    const unsub = subscribePath((p) => paths.push(p));
    navigate("/library");
    expect(paths.at(-1)).toBe("/library");
    unsub();
  });

  it("supports subject library paths", () => {
    const paths: string[] = [];
    const unsub = subscribePath((p) => paths.push(p));
    navigate("/library/subjects/subj_1");
    expect(paths.at(-1)).toBe("/library/subjects/subj_1");
    unsub();
  });

  it("updates when only the query string changes on the same pathname", () => {
    navigate("/study?deckId=d1");
    expect(locationKey()).toBe("/study?deckId=d1");
    const locs: { pathname: string; search: string }[] = [];
    const unsub = subscribeLocation((loc) => locs.push(loc));
    navigate("/study?subjectId=s1");
    expect(locationKey()).toBe("/study?subjectId=s1");
    expect(locs.at(-1)).toEqual({
      pathname: "/study",
      search: "?subjectId=s1",
    });
    unsub();
  });

  it("no-ops when pathname and search are unchanged", () => {
    navigate("/study?deckId=d1");
    const locs: unknown[] = [];
    const unsub = subscribeLocation((loc) => locs.push(loc));
    navigate("/study?deckId=d1");
    expect(locs).toHaveLength(0);
    unsub();
  });

  it("navigateReplace updates location without stacking peers", () => {
    navigate("/insights");
    const before = window.history.length;
    navigateReplace("/today");
    expect(locationKey()).toBe("/today");
    expect(window.history.length).toBe(before);
  });
});

describe("shellBackHref", () => {
  it("hides Back on shell roots", () => {
    expect(shellBackHref("/today")).toBeNull();
    expect(shellBackHref("/insights")).toBeNull();
    expect(shellBackHref("/library")).toBeNull();
    expect(shellBackHref("/atlas")).toBeNull();
    expect(shellBackHref("/atlas/a1")).toBeNull();
    expect(shellBackHref("/settings")).toBeNull();
    expect(shellBackHref("/achievements")).toBeNull();
    expect(shellBackHref("/study")).toBeNull();
  });

  it("returns Library for nested library and draft routes", () => {
    expect(shellBackHref("/library/decks/d1")).toBe("/library");
    expect(shellBackHref("/library/subjects/s1")).toBe("/library");
    expect(shellBackHref("/jobs/job_1/drafts")).toBe("/library");
    expect(shellBackHref("/admin/users/u1")).toBe("/admin");
    expect(shellBackHref("/admin")).toBeNull();
  });

  it("maps Atlas entry and compare paths to the cabinet", () => {
    expect(shellBackHref("/library/subjects/s1/atlas")).toBeNull();
    expect(shellBackHref("/atlas/a1/entry/x")).toBe("/atlas/a1");
    expect(shellBackHref("/atlas/a1/compare/x/y")).toBe("/atlas/a1");
  });
});

type EntryState = {
  key: string;
  from?: string;
  fromKey?: string;
  fromDoc?: string;
};
const entry = () => window.history.state as EntryState;

describe("history entry state", () => {
  it("navigate writes a fresh key and the location it left", () => {
    navigate("/library");
    const before = currentEntryKey();
    navigate("/library/decks/d1");
    expect(entry().from).toBe("/library");
    expect(entry().key).not.toBe(before);
    expect(currentEntryKey()).toBe(entry().key);
  });

  it("navigate records the left entry's key and this document", () => {
    navigate("/library");
    const libraryKey = currentEntryKey();
    navigate("/library/decks/d1");
    expect(entry().fromKey).toBe(libraryKey);
    expect(entry().fromDoc).toEqual(expect.any(String));
  });

  it("navigateReplace mints a new key and keeps from", () => {
    navigate("/library");
    navigate("/library/decks/d1");
    const { key, from } = entry();
    navigateReplace("/library/decks/d2");
    expect(entry().from).toBe(from);
    expect(entry().key).not.toBe(key);
  });

  it("currentEntryKey stamps a missing key without changing the URL", () => {
    window.history.replaceState(null, "", "/settings");
    const key = currentEntryKey();
    expect(locationKey()).toBe("/settings");
    expect(currentEntryKey()).toBe(key);
  });
});

describe("goShellBack", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pops when the previous entry is the back target", () => {
    navigate("/library?sort=name");
    navigate("/library/decks/d1");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    goShellBack("/library");
    expect(back).toHaveBeenCalledOnce();
    expect(locationKey()).toBe("/library/decks/d1");
  });

  it("pushes the back target when we came from elsewhere", () => {
    navigate("/today");
    navigate("/library/decks/d1");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    goShellBack("/library");
    expect(back).not.toHaveBeenCalled();
    expect(locationKey()).toBe("/library");
  });

  it("pushes the parent with its old key when the entry came from an earlier document", () => {
    navigate("/library");
    navigate("/library/decks/d1");
    const { fromKey } = entry();
    window.history.replaceState(
      { ...entry(), fromDoc: "previous-document" },
      "",
    );
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    goShellBack("/library");
    expect(back).not.toHaveBeenCalled();
    expect(locationKey()).toBe("/library");
    expect(entry().key).toBe(fromKey);
  });
});
