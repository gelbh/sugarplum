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
          packActive: true,
          userKey: "pack-user",
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

  it("opens a hidden entry with a notice and a Pin action", async () => {
    const host = await renderEntry(hidden, [named, hidden]);
    expect(host.textContent).toContain("Not in your course pack");
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toContain("Pin");
    expect(labels).toContain("Pin (always show)");
  });

  it("shows no notice for an entry in the pack", async () => {
    const host = await renderEntry(named, [named, hidden]);
    expect(host.textContent).not.toContain("Not in your course pack");
  });

  it("keeps hidden entries out of the rail", async () => {
    const host = await renderEntry(named, [named, hidden]);
    expect(host.querySelector('a[href="#psoroptes-ovis"]')).toBeTruthy();
    expect(host.querySelector('a[href="#toxocara-canis"]')).toBeNull();
  });
});
