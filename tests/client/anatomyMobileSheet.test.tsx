/** @vitest-environment jsdom */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import AnatomyMobileSheet, {
  type AnatomySheetTab,
} from "../../src/anatomy/AnatomyMobileSheet";
import { createStructureUiState } from "../../src/anatomy/structureState";

const structures = [
  { id: "femur", label: "Femur", node: "Femur", region: "legs-right" },
];

function Harness({ initialTab }: { initialTab: AnatomySheetTab }) {
  const [tab, setTab] = useState(initialTab);
  const [open, setOpen] = useState(true);
  return createElement(AnatomyMobileSheet, {
    open,
    onClose: () => setOpen(false),
    tab,
    onTabChange: setTab,
    structures,
    regions: [{ id: "legs-right", label: "Right limb" }],
    activeRegions: new Set(["legs-right"]),
    onChangeRegions: () => undefined,
    ui: createStructureUiState(),
    dispatch: () => undefined,
    studyMode: "explore",
    onStudyModeChange: () => undefined,
    selectedStructure: structures[0],
    regionStructures: structures,
    onCorrect: () => undefined,
  });
}

async function renderSheet(tab: AnatomySheetTab) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(Harness, { initialTab: tab }),
      ),
    );
  });
  // Drawer portals to body; give MUI a tick.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { host, root };
}

describe("AnatomyMobileSheet", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows structure list on structures tab", async () => {
    await renderSheet("structures");
    expect(document.body.textContent).toMatch(/Femur/);
  });

  it("shows study controls on study tab", async () => {
    await renderSheet("study");
    expect(document.body.textContent).toMatch(/Explore/);
    expect(document.body.textContent).toMatch(/Type/);
    expect(document.body.textContent).toMatch(/MCQ/);
  });
});
