/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntryView from "../../src/atlas/entry/EntryView";
import type { AtlasEntryView } from "../../src/atlas/types";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mockMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function entry(id: string, name: string): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.group = "nematode";
  return {
    id,
    originKey: id,
    canonicalName: name,
    commonName: null,
    aliases: [],
    fields,
    refs: [],
    images: [],
    editedAt: null,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
  };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderEntry(onOpen = vi.fn()) {
  // Phone: down(md) true, up(lg) false
  mockMatchMedia((query) => {
    if (query.includes("1200") || query.includes("lg")) return false;
    if (query.includes("900") || query.includes("md")) return true;
    return false;
  });
  const a = entry("a", "Alpha spp");
  const b = entry("b", "Beta spp");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(EntryView, {
          entry: a,
          entries: [a, b],
          entryHref: (id) => `#${id}`,
          onOpen,
          onStep: () => undefined,
          packHiddenIds: new Set<string>(),
          showHidden: false,
          mobile: true,
        }),
      ),
    );
  });
  await flush();
  return { host, onOpen };
}

function railDrawerOpen(): boolean {
  const opener = document.querySelector(
    'button[aria-label="All parasites"]',
  ) as HTMLButtonElement | null;
  return opener?.getAttribute("aria-expanded") === "true";
}

describe("EntryView mobile rail", () => {
  it("opens a bottom drawer for All parasites", async () => {
    const { host } = await renderEntry();
    const opener = host.querySelector(
      'button[aria-label="All parasites"]',
    ) as HTMLButtonElement;
    expect(opener).toBeTruthy();
    await act(async () => {
      opener.click();
    });
    await flush();
    expect(railDrawerOpen()).toBe(true);
    // Mobile path uses bottom anchor; left-docked paper should not appear.
    expect(document.querySelector('[class*="paperAnchorLeft"]')).toBeNull();
    expect(
      document.querySelector('nav[aria-label="All parasites"]'),
    ).toBeTruthy();
  });

  it("closes the sheet when picking another entry", async () => {
    const { host, onOpen } = await renderEntry();
    const opener = host.querySelector(
      'button[aria-label="All parasites"]',
    ) as HTMLButtonElement;
    await act(async () => {
      opener.click();
    });
    await flush();
    const link = document.querySelector('a[href="#b"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    await act(async () => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(onOpen).toHaveBeenCalledWith("b");
    // MUI temporary Drawer exit transition keeps paper mounted briefly.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(railDrawerOpen()).toBe(false);
  });
});
