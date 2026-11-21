/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import EntryFacts from "../../src/atlas/entry/EntryFacts";
import type { AtlasEntryView, CorrectionStatus } from "../../src/atlas/types";
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

function entry(status: CorrectionStatus | null): AtlasEntryView {
  return {
    id: "row-1",
    originKey: "psoroptes-ovis",
    canonicalName: "Psoroptes ovis",
    commonName: "Sheep scab mite",
    aliases: [],
    learnerAliases: [],
    fields: emptyParasiteFields() as AtlasEntryView["fields"],
    refs: [],
    images: [],
    editedAt: "2026-11-20T00:00:00.000Z",
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields: [],
    commonNameEdited: false,
    suggestionStatus: status,
  };
}

async function renderFacts(status: CorrectionStatus | null) {
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
          entry: entry(status),
          refs: { groups: [], byField: new Map() },
          onCite: () => undefined,
          mobile: false,
        }),
      ),
    );
  });
  return host;
}

describe("EntryFacts correction status chip", () => {
  it.each([
    ["open", "Correction suggested"],
    ["accepted", "Accepted for review"],
    ["rejected", "Not accepted"],
  ] as const)("shows %s as %s next to Edited", async (status, label) => {
    const host = await renderFacts(status);
    expect(host.textContent).toContain("Edited");
    expect(host.textContent).toContain(label);
  });

  it("shows no status chip without a suggestion", async () => {
    const host = await renderFacts(null);
    expect(host.textContent).not.toMatch(
      /Correction suggested|Accepted for review|Not accepted/,
    );
  });
});
