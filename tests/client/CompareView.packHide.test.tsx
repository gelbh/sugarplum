/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import CompareView from "../../src/atlas/compare/CompareView";
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
  entry("demodex-canis", "Demodex canis", true),
  entry("toxocara-canis", "Toxocara canis", false),
];

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderCompare() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(CompareView, {
          entries: ENTRIES,
          a: "psoroptes-ovis",
          b: "",
          entryHref: (id) => `#${id}`,
          onOpenEntry: () => undefined,
          onChange: () => undefined,
          packHiddenIds: packHiddenIds(ENTRIES, true),
          showHidden: false,
        }),
      ),
    );
  });
  await flush();
  return host;
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

const listbox = () =>
  (document.querySelector('[role="listbox"]') as HTMLElement | null)
    ?.textContent ?? "";

describe("CompareView pack hiding", () => {
  it("side pickers hide not-in-pack entries until searched", async () => {
    const host = await renderCompare();
    const picker = host.querySelectorAll("input")[1] as HTMLInputElement;
    await act(async () => {
      picker.focus();
      picker.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    await flush();
    expect(listbox()).toContain("Demodex canis");
    expect(listbox()).not.toContain("Toxocara canis");
    await type(picker, "canis");
    expect(listbox()).toContain("Demodex canis");
    expect(listbox()).toContain("Toxocara canis");
    expect(listbox()).toContain("Not in your pack");
  });
});
