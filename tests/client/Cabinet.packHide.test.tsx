/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import Cabinet from "../../src/atlas/hub/Cabinet";
import { packHiddenIds } from "../../src/atlas/hub/filter";
import { useShowHiddenPref } from "../../src/atlas/hub/packHidePref";
import type { AtlasEntryView } from "../../src/atlas/types";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const USER = "pack-user";
const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  localStorage.clear();
});

function entry(id: string, name: string, inPack: boolean): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.group = "arthropod";
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

const ENTRIES = [
  entry("psoroptes-ovis", "Psoroptes ovis", true),
  entry("toxocara-canis", "Toxocara canis", false),
];

/** Stands in for AtlasPage, which owns the pack state and the preference. */
function PackCabinet({ entries }: { entries: AtlasEntryView[] }) {
  const [showHidden, setShowHidden] = useShowHiddenPref(USER);
  return createElement(Cabinet, {
    entries,
    userKey: USER,
    entryHref: (id) => `#${id}`,
    onOpenEntry: () => undefined,
    onCompare: () => undefined,
    stagger: false,
    packHiddenIds: packHiddenIds(entries, true),
    showHidden,
    onShowHiddenChange: setShowHidden,
    mobile: false,
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderCabinet(entries: AtlasEntryView[] = ENTRIES) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(PackCabinet, { entries }),
      ),
    );
  });
  await flush();
  return { host, root };
}

function buttonByText(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

describe("Cabinet pack hiding", () => {
  it("hides entries not in the pack and counts them", async () => {
    const { host } = await renderCabinet();
    expect(host.textContent).toContain("Psoroptes ovis");
    expect(host.textContent).not.toContain("Toxocara canis");
    // Pack hiding alone is not narrowing, so no "X of N".
    expect(host.textContent).toContain("1 parasite · 1 hidden · Show hidden");
    expect(host.textContent).not.toContain("1 of 2");
    expect(buttonByText(host, "Show hidden")!.type).toBe("button");
  });

  it("keeps a key-pinned entry visible while the pack is active", async () => {
    const pinned: AtlasEntryView = {
      ...entry("demodex-canis", "Demodex canis", false),
      override: "key",
      tier: "key",
      reason: "Manual pin",
    };
    const { host } = await renderCabinet([...ENTRIES, pinned]);
    expect(host.textContent).toContain("Demodex canis");
    expect(host.textContent).not.toContain("Toxocara canis");
    expect(host.textContent).toContain("2 parasites · 1 hidden · Show hidden");
  });

  it("Show hidden reveals hidden entries with the chip", async () => {
    const { host } = await renderCabinet();
    await click(buttonByText(host, "Show hidden")!);
    expect(host.textContent).toContain("Toxocara canis");
    expect(host.textContent).toContain("Not in your pack");
    expect(buttonByText(host, "Hide 1 not in pack")).toBeTruthy();
  });

  it("search finds hidden entries and marks them", async () => {
    const { host } = await renderCabinet();
    const search = host.querySelector(
      'input[aria-label="Search parasites"]',
    ) as HTMLInputElement;
    await type(search, "toxocara");
    expect(host.textContent).toContain("Toxocara canis");
    expect(host.textContent).toContain("Not in your pack");
    // Matches are already shown, so the hidden segment drops while searching.
    expect(host.textContent).toContain("1 of 2 parasites");
    expect(host.textContent).not.toContain("1 hidden");
    expect(buttonByText(host, "Show hidden")).toBeUndefined();
    await type(search, "");
    expect(host.textContent).toContain("1 hidden · Show hidden");
  });

  it("offers Show N hidden when the pack hides everything", async () => {
    const { host } = await renderCabinet([
      entry("toxocara-canis", "Toxocara canis", false),
      entry("toxascaris-leonina", "Toxascaris leonina", false),
    ]);
    expect(host.textContent).toContain("No parasites named in your pack");
    expect(buttonByText(host, "Clear filters")).toBeUndefined();
    await click(buttonByText(host, "Show 2 hidden")!);
    expect(host.textContent).toContain("Toxocara canis");
    expect(host.textContent).toContain("Toxascaris leonina");
    expect(host.textContent).toContain("Hide 2 not in pack");
  });

  it("keeps Show hidden after a remount", async () => {
    const first = await renderCabinet();
    await click(buttonByText(first.host, "Show hidden")!);
    expect(localStorage.getItem(`sugarplum.atlas.showHidden.${USER}`)).toBe("1");
    act(() => {
      first.root.unmount();
    });
    const second = await renderCabinet();
    expect(second.host.textContent).toContain("Toxocara canis");
  });

  it("compare picker uses the same hiding and search exception", async () => {
    const { host } = await renderCabinet();
    await click(host.querySelector('button[aria-label="Compare"]') as HTMLElement);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("Psoroptes ovis");
    expect(dialog.textContent).not.toContain("Toxocara canis");
    await type(
      dialog.querySelector('input[aria-label="Search parasites"]') as HTMLInputElement,
      "toxocara",
    );
    expect(dialog.textContent).toContain("Toxocara canis");
    expect(dialog.textContent).toContain("Not in your pack");
  });
});
