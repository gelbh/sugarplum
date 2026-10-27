/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { navigate, subscribePath } from "../../src/nav/navigate";

describe("navigate", () => {
  it("pushState updates path subscribers", () => {
    const paths: string[] = [];
    const unsub = subscribePath((p) => paths.push(p));
    navigate("/library");
    expect(paths.at(-1)).toBe("/library");
    unsub();
  });
});
