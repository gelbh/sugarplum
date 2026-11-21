/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntryFacts from "../../src/atlas/entry/EntryFacts";
import type { AtlasEntryView } from "../../src/atlas/types";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

function richEntry(
  editedFields: AtlasEntryView["editedFields"] = [],
  significance = "Major cause of ostertagiosis in grazing sheep.",
): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.significance = significance;
  fields.phylum = "Nematoda";
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
    learnerAliases: [],
    fields: fields as AtlasEntryView["fields"],
    refs: [],
    images: [],
    editedAt: editedFields.length ? "2026-11-20T00:00:00.000Z" : null,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields,
    commonNameEdited: false,
  };
}

async function renderFacts(props: {
  entry?: AtlasEntryView;
  onEdit?: (section?: string) => void;
  onResetField?: (field: string) => void;
}) {
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
          entry: props.entry ?? richEntry(),
          refs: { groups: [], byField: new Map() },
          onCite: () => undefined,
          mobile: false,
          onEdit: props.onEdit,
          onResetField: props.onResetField,
        }),
      ),
    );
  });
  return host;
}

async function click(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  expect(button, label).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}

describe("EntryFacts edit pencils", () => {
  it("opens the matching dialog section from each glance band", async () => {
    const onEdit = vi.fn();
    const host = await renderFacts({ onEdit });
    await click(host, "Edit Taxonomy");
    await click(host, "Edit Hosts");
    await click(host, "Edit Body & course");
    await click(host, "Edit Detection & risk");
    await click(host, "Edit Range");
    expect(onEdit.mock.calls.map((c) => c[0])).toEqual([
      "taxonomy",
      "hosts",
      "biology",
      "diagnosis",
      "distribution",
    ]);
  });

  it("keeps the top Edit button opening the dialog with no section", async () => {
    const onEdit = vi.fn();
    const host = await renderFacts({ onEdit });
    const edit = [...host.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Edit",
    );
    await act(async () => {
      edit!.click();
    });
    expect(onEdit).toHaveBeenCalledWith();
  });

  it("renders no pencils without onEdit", async () => {
    const host = await renderFacts({});
    expect(host.querySelector('button[aria-label^="Edit "]')).toBeNull();
  });
});

describe("EntryFacts glance Edited marks", () => {
  it("marks overridden fields on their band and resets one field", async () => {
    const onResetField = vi.fn();
    const host = await renderFacts({
      entry: richEntry(["definitiveHosts", "significance"]),
      onResetField,
    });
    const hosts = host.querySelector('[aria-label="Hosts"]')!;
    expect(hosts.textContent).toContain("Edited: Definitive hosts");
    await click(host, "Reset Definitive hosts");
    await click(host, "Reset Significance");
    expect(onResetField.mock.calls.map((c) => c[0])).toEqual([
      "definitiveHosts",
      "significance",
    ]);
  });

  it("marks significance beside the lead, not on Detection", async () => {
    const host = await renderFacts({
      entry: richEntry(["significance"]),
      onResetField: () => undefined,
    });
    const summary = host.querySelector('[aria-label="Summary"]')!;
    const detection = host.querySelector('[aria-label="Detection & risk"]')!;
    expect(summary.textContent).toContain("Edited: Significance");
    expect(detection.textContent).not.toContain("Edited: Significance");
    expect(host.querySelector('[aria-label="Notes"]')).toBeNull();
    expect(
      host.querySelectorAll('button[aria-label="Reset Significance"]'),
    ).toHaveLength(1);
  });

  it("marks significance on Notes when the lead is truncated", async () => {
    const host = await renderFacts({
      entry: richEntry(["significance"], "Long significance text. ".repeat(20)),
      onResetField: () => undefined,
    });
    const notes = host.querySelector('[aria-label="Notes"]')!;
    const summary = host.querySelector('[aria-label="Summary"]')!;
    expect(notes.textContent).toContain("Edited: Significance");
    expect(summary.textContent).not.toContain("Edited: Significance");
    expect(
      host.querySelectorAll('button[aria-label="Reset Significance"]'),
    ).toHaveLength(1);
  });

  it("shows the mark without a Reset button when resets are not allowed", async () => {
    const host = await renderFacts({ entry: richEntry(["definitiveHosts"]) });
    expect(host.textContent).toContain("Edited: Definitive hosts");
    expect(host.querySelector('button[aria-label^="Reset "]')).toBeNull();
  });
});
