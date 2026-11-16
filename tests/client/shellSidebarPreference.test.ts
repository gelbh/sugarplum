import { describe, expect, it } from "vitest";
import {
  loadShellSidebarCollapsed,
  saveShellSidebarCollapsed,
  SHELL_SIDEBAR_COLLAPSED_KEY,
} from "../../src/components/shell/shellSidebarPreference";

function memStore(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("shellSidebarPreference", () => {
  it("defaults to null when unset", () => {
    expect(loadShellSidebarCollapsed(memStore())).toBeNull();
  });

  it("round-trips collapsed and expanded", () => {
    const store = memStore();
    saveShellSidebarCollapsed(true, store);
    expect(store.getItem(SHELL_SIDEBAR_COLLAPSED_KEY)).toBe("1");
    expect(loadShellSidebarCollapsed(store)).toBe(true);
    saveShellSidebarCollapsed(false, store);
    expect(loadShellSidebarCollapsed(store)).toBe(false);
  });
});
