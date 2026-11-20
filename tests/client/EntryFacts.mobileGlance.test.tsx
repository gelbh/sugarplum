/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import EntryFacts from "../../src/atlas/entry/EntryFacts";
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

function richEntry(): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.phylum = "Nematoda";
  fields.order = "Strongylida";
  fields.family = "Trichostrongylidae";
  fields.definitiveHosts = ["sheep"];
  fields.majorOrgan = "abomasum";
  fields.zoonotic = "no";
  fields.distribution = "Temperate";
  return {
    id: "e1",
    originKey: "ostertagia-ostertagi",
    canonicalName: "Ostertagia ostertagi",
    commonName: "Brown stomach worm",
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

async function renderFacts(mobile: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(EntryFacts, {
          entry: richEntry(),
          refs: { groups: [], byField: new Map() },
          onCite: () => undefined,
          mobile,
        }),
      ),
    );
  });
  return host;
}

describe("EntryFacts mobile progressive glance", () => {
  it("hides taxonomy and range until More facts on mobile", async () => {
    const host = await renderFacts(true);
    expect(host.querySelector('[aria-label="Hosts"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Taxonomy"]')).toBeNull();
    expect(host.querySelector('[aria-label="Range"]')).toBeNull();
    const more = [...host.querySelectorAll("button")].find((b) =>
      /More facts/i.test(b.textContent ?? ""),
    );
    expect(more).toBeTruthy();
    await act(async () => {
      more!.click();
    });
    expect(host.querySelector('[aria-label="Taxonomy"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Range"]')).toBeTruthy();
  });

  it("shows all densify bands on desktop", async () => {
    const host = await renderFacts(false);
    expect(host.querySelector('[aria-label="Taxonomy"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Hosts"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Range"]')).toBeTruthy();
    expect(
      [...host.querySelectorAll("button")].some((b) =>
        /More facts/i.test(b.textContent ?? ""),
      ),
    ).toBe(false);
  });
});
