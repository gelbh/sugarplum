/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MissionBoard from "../../src/deckHub/MissionBoard";
import {
  popWorkshop,
  pushWorkshop,
  replaceWorkshop,
  type WorkshopFrame,
} from "../../src/deckHub/workshopStack";
import WorkshopShell from "../../src/deckHub/WorkshopShell";
import AddMaterialWorkshop from "../../src/deckHub/AddMaterialWorkshop";
import type { CardDraftView } from "../../src/api/client";
import { theme } from "../../src/theme";

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
  vi.clearAllMocks();
});

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ThemeProvider, { theme }, node));
  });
}

function blankCard(overrides: Partial<CardDraftView> = {}): CardDraftView {
  return {
    id: "c1",
    deck_id: "d1",
    job_id: null,
    type: "qa",
    front: "Front",
    back: "Back",
    provenance: null,
    status: "accepted",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("deck hub mission board smoke", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it("renders an icon mark per mission tile (no atlas photos)", async () => {
    const onOpen = vi.fn();
    await render(
      createElement(MissionBoard, {
        draftCount: 1,
        cardCount: 2,
        emptyDeck: false,
        onOpen,
      }),
    );
    const tiles = document.querySelectorAll('[role="listitem"]');
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      expect(tile.querySelector("img")).toBeNull();
      expect(tile.querySelector("svg")).toBeTruthy();
    }
    expect(document.querySelector('[data-tile-id="addMaterial"]')).toBeTruthy();
    expect(document.querySelector('[data-tile-id="drafts"]')).toBeTruthy();
    expect(document.querySelector('[data-tile-id="cards"]')).toBeTruthy();
    expect(document.querySelector('[data-tile-id="study"]')).toBeNull();
  });

  it("hides drafts and cards tiles when empty", async () => {
    await render(
      createElement(MissionBoard, {
        draftCount: 0,
        cardCount: 0,
        emptyDeck: true,
        onOpen: () => {},
      }),
    );
    expect(document.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    expect(document.querySelector('[data-tile-id="addMaterial"]')).toBeTruthy();
    expect(document.querySelector('[data-tile-id="drafts"]')).toBeNull();
    expect(document.querySelector('[data-tile-id="cards"]')).toBeNull();
  });

  it("opens Create flashcards from the mission board tile", async () => {
    const onOpen = vi.fn();
    await render(
      createElement(MissionBoard, {
        draftCount: 0,
        cardCount: 0,
        emptyDeck: true,
        onOpen,
      }),
    );

    const addTile = Array.from(
      document.body.querySelectorAll('[role="listitem"]'),
    ).find((el) => el.textContent?.includes("Create flashcards"));
    expect(addTile).toBeTruthy();
    await act(async () => {
      addTile!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledWith("addMaterial");
  });

  it("stacks Cards → DIY Create → Back", async () => {
    let stack: WorkshopFrame[] = [{ id: "cards" }];
    stack = pushWorkshop(stack, { id: "addMaterial", tab: "diy" });
    expect(stack).toEqual([{ id: "cards" }, { id: "addMaterial", tab: "diy" }]);

    await render(
      createElement(WorkshopShell, {
        open: true,
        title: "Create flashcards",
        closeMode: false,
        onBack: () => {
          stack = popWorkshop(stack);
        },
        children: createElement(AddMaterialWorkshop, {
          guest: false,
          tab: "diy",
          onTabChange: () => {},
          onCancel: () => {
            stack = popWorkshop(stack);
          },
          returnToChooser: false,
          materialError: null,
          materialNotice: null,
          onClearMaterialMessages: () => {},
          materialBusy: false,
          readingScan: false,
          pasteText: "",
          onPasteTextChange: () => {},
          pasteFilename: "",
          onPasteFilenameChange: () => {},
          onGuestPaste: () => {},
          onAccountPaste: () => {},
          uploadFile: null,
          onUploadFileChange: () => {},
          onFigureFilesChange: () => {},
          onUploadFile: () => {},
          alsoCover: "",
          onAlsoCoverChange: () => {},
          offerLearningObjectives: true,
          submitLabel: "Start generation",
          submitDisabled: false,
          freePathImageHelper: null,
          renderUploadConsents: () => null,
          createCard: blankCard({ id: "hub-create-draft", status: "draft" }),
          createBusy: false,
          createImageBusy: false,
          createError: null,
          createNotice: null,
          createSessionHasCard: false,
          createNeedsImage: false,
          createImageKey: "",
          deckImageKeys: [],
          createImageInputRef: { current: null },
          onCreateChange: () => {},
          onCreateCard: () => {},
          onCreateImageUpload: () => {},
          applyCreateImageKey: () => {},
          clearCreateNotice: () => {},
          hubDiyAllowedTypes: ["qa", "cloze", "mcq"],
        }),
      }),
    );

    expect(document.body.textContent).toMatch(/DIY|Create|card/i);
    const back = document.body.querySelector('[aria-label="Back"]');
    expect(back).toBeTruthy();
    await act(async () => {
      back!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(stack.map((f) => f.id)).toEqual(["cards"]);
  });

  it("shows upload drop zone without a Review drafts shortcut", async () => {
    await render(
      createElement(AddMaterialWorkshop, {
        guest: false,
        tab: "upload",
        onTabChange: () => {},
        onCancel: () => {},
        materialError: null,
        materialNotice: null,
        onClearMaterialMessages: () => {},
        materialBusy: false,
        readingScan: false,
        pasteText: "",
        onPasteTextChange: () => {},
        pasteFilename: "",
        onPasteFilenameChange: () => {},
        onGuestPaste: () => {},
        onAccountPaste: () => {},
        uploadFile: null,
        onUploadFileChange: () => {},
        onFigureFilesChange: () => {},
        onUploadFile: () => {},
        alsoCover: "",
        onAlsoCoverChange: () => {},
        offerLearningObjectives: true,
        submitLabel: "Start generation",
        submitDisabled: false,
        freePathImageHelper: null,
        renderUploadConsents: () => null,
        createCard: blankCard({ id: "hub-create-draft", status: "draft" }),
        createBusy: false,
        createImageBusy: false,
        createError: null,
        createNotice: null,
        createSessionHasCard: false,
        createNeedsImage: false,
        createImageKey: "",
        deckImageKeys: [],
        createImageInputRef: { current: null },
        onCreateChange: () => {},
        onCreateCard: () => {},
        onCreateImageUpload: () => {},
        applyCreateImageKey: () => {},
        clearCreateNotice: () => {},
        hubDiyAllowedTypes: ["qa", "cloze", "mcq"],
      }),
    );

    expect(document.body.textContent).not.toContain("Review drafts");
    expect(document.body.textContent).toContain(
      "Drop PDF, PPTX, or image here",
    );
    expect(document.body.textContent).toContain("Choose file");

    const replaced = replaceWorkshop([{ id: "addMaterial" }], { id: "cards" });
    expect(replaced).toEqual([{ id: "cards" }]);
  });

  it("keeps Study off the mission board", async () => {
    await render(
      createElement(MissionBoard, {
        draftCount: 1,
        cardCount: 0,
        emptyDeck: false,
        onOpen: () => {},
      }),
    );
    expect(document.querySelector('[data-tile-id="study"]')).toBeNull();
    expect(document.querySelector('[data-tile-id="cards"]')).toBeNull();
    expect(document.querySelector('[data-tile-id="drafts"]')).toBeTruthy();
  });
});
