/** @vitest-environment jsdom */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import AnatomyMobileSheet, {
  type AnatomySheetTab,
} from "../../src/anatomy/viewer/AnatomyMobileSheet";
import { createStructureUiState } from "../../src/anatomy/structure/structureState";
import type { AnatomyClip } from "../../src/anatomy/types";

const structures = [
  { id: "femur", label: "Femur", node: "Femur", region: "legs-right" },
];

const clips: AnatomyClip[] = [
  { id: "falcine", label: "Falcine", animation: "BrainFalcineAnimation" },
  {
    id: "caudal",
    label: "Caudal tentorial",
    animation: "BrainCaudalTentorialAnimation",
  },
];

type HarnessProps = {
  initialTab: AnatomySheetTab;
  clips?: AnatomyClip[];
};

function Harness({ initialTab, clips: clipList }: HarnessProps) {
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
    clips: clipList,
    clipsDisabled: false,
    activeClipId: null,
    clipPaused: false,
    clipError: null,
    onSelectClip: () => undefined,
    onTogglePauseClip: () => undefined,
  });
}

const liveRoots: Array<ReturnType<typeof createRoot>> = [];

async function renderSheet(tab: AnatomySheetTab, clipList?: AnatomyClip[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  liveRoots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(Harness, { initialTab: tab, clips: clipList }),
      ),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { host, root };
}

describe("AnatomyMobileSheet", () => {
  afterEach(async () => {
    // Unmount before tearing down the DOM so deferred React work does not
    // hit "window is not defined" after the jsdom environment is gone.
    await act(async () => {
      for (const root of liveRoots) root.unmount();
    });
    liveRoots.length = 0;
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

  it("lists clip labels on clips tab", async () => {
    await renderSheet("clips", clips);
    expect(document.body.textContent).toMatch(/Falcine/);
    expect(document.body.textContent).toMatch(/Caudal tentorial/);
  });

  it("omits Clips tab when no clips", async () => {
    await renderSheet("structures");
    const tabs = Array.from(document.body.querySelectorAll('[role="tab"]')).map(
      (el) => el.textContent,
    );
    expect(tabs).toContain("Structures");
    expect(tabs).toContain("Study");
    expect(tabs).not.toContain("Clips");
  });

  it("shows Clips tab when clips exist", async () => {
    await renderSheet("structures", clips);
    const tabs = Array.from(document.body.querySelectorAll('[role="tab"]')).map(
      (el) => el.textContent,
    );
    expect(tabs).toContain("Clips");
  });
});
