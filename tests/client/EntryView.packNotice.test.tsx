/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntryView from "../../src/atlas/entry/EntryView";
import { packHiddenIds } from "../../src/atlas/hub/filter";
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

function entry(id: string, name: string, inPack: boolean): AtlasEntryView {
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
    tier: "standard",
    reason: "Standard",
    override: null,
    focusMaterialIds: [],
    inPack,
  };
}

async function renderEntry(current: AtlasEntryView, entries: AtlasEntryView[]) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
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
          entry: current,
          entries,
          entryHref: (id) => `#${id}`,
          onOpen: () => undefined,
          onStep: () => undefined,
          atlasId: "atlas-1",
          onFocusUpdated: () => undefined,
          packHiddenIds: packHiddenIds(entries, true),
          showHidden: false,
          mobile: false,
        }),
      ),
    );
  });
  return host;
}

describe("EntryView pack notice", () => {
  const named = entry("psoroptes-ovis", "Psoroptes ovis", true);
  const hidden = entry("toxocara-canis", "Toxocara canis", false);

  const pinButtons = (host: HTMLElement) =>
    [...host.querySelectorAll("button")].filter((b) =>
      b.textContent?.startsWith("Pin"),
    );

  it("opens a hidden entry with a notice holding the only pin control", async () => {
    const host = await renderEntry(hidden, [named, hidden]);
    const notice = host.querySelector('[role="alert"]') as HTMLElement;
    expect(notice.textContent).toContain("Not in your course pack");
    const pins = pinButtons(host);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.textContent).toBe("Pin (always show)");
    expect(notice.contains(pins[0]!)).toBe(true);
  });

  it("shows no notice for an entry in the pack, only the header pin", async () => {
    const host = await renderEntry(named, [named, hidden]);
    expect(host.textContent).not.toContain("Not in your course pack");
    const pins = pinButtons(host);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.textContent).toBe("Pin (always show)");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("keeps hidden entries out of the rail", async () => {
    const host = await renderEntry(named, [named, hidden]);
    expect(host.querySelector('a[href="#psoroptes-ovis"]')).toBeTruthy();
    expect(host.querySelector('a[href="#toxocara-canis"]')).toBeNull();
  });
});
