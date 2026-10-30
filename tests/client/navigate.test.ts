/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  locationKey,
  navigate,
  navigateReplace,
  shellBackHref,
  subscribeLocation,
  subscribePath,
} from "../../src/nav/navigate";

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
});
