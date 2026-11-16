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
import CardsWorkshop from "../../src/deckHub/CardsWorkshop";
import type { CardDraftView } from "../../src/api/client";
import { theme } from "../../src/theme";

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

  it("renders a distinct image mark per mission tile", async () => {
    const onOpen = vi.fn();
    await render(
      createElement(MissionBoard, {
        draftCount: 1,
        cardCount: 2,
        acceptedCount: 2,
        emptyDeck: false,
        onOpen,
      }),
    );
    const tiles = document.querySelectorAll('[role="listitem"]');
    expect(tiles).toHaveLength(4);
    const srcs = [...tiles].map((tile) => tile.querySelector("img")?.getAttribute("src"));
    expect(srcs.every(Boolean)).toBe(true);
    expect(new Set(srcs).size).toBe(4);
    expect(
      document.querySelector('[data-tile-id="addMaterial"] img')?.getAttribute("src"),
    ).toContain("muscle.webp");
    expect(
      document.querySelector('[data-tile-id="drafts"] img')?.getAttribute("src"),
    ).toContain("pineapple.svg");
    expect(
      document.querySelector('[data-tile-id="cards"] img')?.getAttribute("src"),
    ).toContain("orange.svg");
    expect(
      document.querySelector('[data-tile-id="study"] img')?.getAttribute("src"),
    ).toContain("strawberry.svg");
  });

  it("opens Add material from the mission board tile", async () => {
    const onOpen = vi.fn();
    await render(
      createElement(MissionBoard, {
        draftCount: 0,
        cardCount: 0,
        acceptedCount: 0,
        emptyDeck: true,
        onOpen,
      }),
    );

    const addTile = Array.from(
      document.body.querySelectorAll('[role="listitem"]'),
    ).find((el) => el.textContent?.includes("Add material"));
    expect(addTile).toBeTruthy();
    await act(async () => {
      addTile!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledWith("addMaterial");
  });

  it("stacks Cards → Create card → Back", async () => {
    let stack: WorkshopFrame[] = [{ id: "cards" }];
    stack = pushWorkshop(stack, { id: "createCard" });
    expect(stack.map((f) => f.id)).toEqual(["cards", "createCard"]);

    await render(
      createElement(WorkshopShell, {
        open: true,
        title: "Create card",
        closeMode: false,
        onBack: () => {
          stack = popWorkshop(stack);
        },
        children: createElement(CardsWorkshop, {
          mode: "create",
          createCard: blankCard({ id: "hub-create-draft", status: "draft" }),
          createBusy: false,
          createImageBusy: false,
          createError: null,
          createNeedsImage: false,
          createImageKey: "",
          deckImageKeys: [],
          createImageInputRef: { current: null },
          hubDiyAllowedTypes: ["qa", "cloze", "mcq"],
          onCreateChange: () => {},
          onCreateSubmit: () => {},
          onCreateImageUpload: () => {},
          applyCreateImageKey: () => {},
        }),
      }),
    );

    expect(document.body.textContent).toContain("Create card");
    const back = document.body.querySelector('[aria-label="Back"]');
    expect(back).toBeTruthy();
    await act(async () => {
      back!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(stack.map((f) => f.id)).toEqual(["cards"]);
  });

  it("replaces Add material with Drafts when drafts exist", async () => {
    const onReviewDrafts = vi.fn();
    await render(
      createElement(AddMaterialWorkshop, {
        guest: false,
        tab: "upload",
        onTabChange: () => {},
        materialError: null,
        materialNotice: null,
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
        figureFiles: [],
        onFigureFilesChange: () => {},
        onUploadFile: () => {},
        pdfSplitOpen: false,
        pdfSplitProgress: null,
        onPdfSplitConfirm: () => {},
        onPdfSplitCancel: () => {},
        pdfCompressOpen: false,
        pdfCompressProgress: null,
        onPdfCompressConfirm: () => {},
        onPdfCompressCancel: () => {},
        topicValue: "",
        onTopicValueChange: () => {},
        topicBusy: false,
        topicError: null,
        onTopicGenerate: () => {},
        createCard: blankCard({ id: "hub-create-draft", status: "draft" }),
        createBusy: false,
        createImageBusy: false,
        createError: null,
        createNeedsImage: false,
        createImageKey: "",
        deckImageKeys: [],
        createImageInputRef: { current: null },
        onCreateChange: () => {},
        onCreateCard: () => {},
        onCreateImageUpload: () => {},
        applyCreateImageKey: () => {},
        hubDiyAllowedTypes: ["qa", "cloze", "mcq"],
        materials: [],
        onMaterialsChanged: () => {},
        draftCount: 2,
        onReviewDrafts,
      }),
    );

    expect(document.body.textContent).toContain("Also review drafts (2)");
    expect(document.body.textContent).toContain(
      "Drop PDF, PPTX, or image here",
    );
    expect(document.body.textContent).toContain("Choose file");
    const jump = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Also review drafts"),
    );
    expect(jump).toBeTruthy();
    await act(async () => {
      jump!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onReviewDrafts).toHaveBeenCalled();

    const replaced = replaceWorkshop([{ id: "addMaterial" }], { id: "drafts" });
    expect(replaced).toEqual([{ id: "drafts" }]);
  });

  it("mutes Study when there are no accepted cards", async () => {
    await render(
      createElement(MissionBoard, {
        draftCount: 1,
        cardCount: 0,
        acceptedCount: 0,
        emptyDeck: false,
        onOpen: () => {},
      }),
    );
    const study = Array.from(
      document.body.querySelectorAll('[role="listitem"]'),
    ).find((el) => el.getAttribute("aria-label")?.includes("Study"));
    expect(study).toBeTruthy();
    expect(study?.getAttribute("aria-disabled") === "true" || study?.hasAttribute("disabled")).toBe(
      true,
    );
  });
});
