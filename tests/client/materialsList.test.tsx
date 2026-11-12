/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialListItem } from "../../src/api/client";
import { theme } from "../../src/theme";

vi.mock("../../src/api/client", () => ({
  ApiError: class ApiError extends Error {},
  deleteMaterial: vi.fn(),
  downloadMaterialUrl: (id: string) => `/api/materials/${id}/download`,
  patchMaterialSourceRole: vi.fn(),
  refillPdfOcr: vi.fn(),
  topicGenerate: vi.fn(),
}));

import MaterialsList from "../../src/components/MaterialsList";

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

function material(
  overrides: Partial<MaterialListItem> & Pick<MaterialListItem, "id" | "kind">,
): MaterialListItem {
  return {
    deck_id: "d1",
    deck_title: "Deck",
    filename: `${overrides.kind}-file`,
    status: "ready",
    r2_key: null,
    source_role: "lecture",
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MaterialsList residual A", () => {
  it("groups by kind and exposes icon action labels", async () => {
    await render(
      createElement(MaterialsList, {
        showDeckTitle: false,
        onChanged: vi.fn(),
        materials: [
          material({ id: "i1", kind: "image", filename: "fig.png" }),
          material({ id: "p1", kind: "pdf", filename: "notes.pdf" }),
          material({ id: "p2", kind: "pdf", filename: "slides.pdf" }),
        ],
      }),
    );

    const text = document.body.textContent ?? "";
    expect(text.indexOf("PDF")).toBeGreaterThan(-1);
    expect(text.indexOf("Image")).toBeGreaterThan(-1);
    expect(text.indexOf("PDF")).toBeLessThan(text.indexOf("Image"));
    expect(
      document.querySelectorAll('[aria-label^="Download"]').length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('[aria-label^="Delete"]').length,
    ).toBeGreaterThan(0);
  });

  it("exposes Create occlusion for ready images when a callback is set", async () => {
    const onCreateOcclusion = vi.fn();
    await render(
      createElement(MaterialsList, {
        showDeckTitle: false,
        onChanged: vi.fn(),
        onCreateOcclusion,
        materials: [
          material({
            id: "i1",
            kind: "image",
            filename: "fig.png",
            r2_key: "materials/d/fig.png",
          }),
        ],
      }),
    );

    const btn = document.querySelector(
      '[aria-label="Create occlusion from fig.png"]',
    );
    expect(btn).toBeTruthy();
    await act(async () => {
      (btn as HTMLButtonElement).click();
    });
    expect(onCreateOcclusion).toHaveBeenCalledTimes(1);
  });

  it("shows a stem group for two-plus split siblings", async () => {
    await render(
      createElement(MaterialsList, {
        showDeckTitle: false,
        onChanged: vi.fn(),
        materials: [
          material({
            id: "p2",
            kind: "pdf",
            filename: "Lecture notes (2/2).pdf",
          }),
          material({
            id: "p1",
            kind: "pdf",
            filename: "Lecture notes (1/2).pdf",
          }),
        ],
      }),
    );

    const stem = document.getElementById("split-stem-pdf-d1-p1");
    expect(stem?.textContent).toBe("Lecture notes");
    const grouped = stem?.parentElement?.querySelector("ul");
    expect(grouped?.getAttribute("aria-labelledby")).toBe(
      "split-stem-pdf-d1-p1",
    );
    expect(
      document.querySelector(
        '[aria-label="Download Lecture notes (1/2).pdf"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '[aria-label="Download Lecture notes (2/2).pdf"]',
      ),
    ).toBeTruthy();
  });

  it("keeps a lone part-shaped name flat without a stem group", async () => {
    await render(
      createElement(MaterialsList, {
        showDeckTitle: false,
        onChanged: vi.fn(),
        materials: [
          material({
            id: "solo",
            kind: "pdf",
            filename: "Lecture notes (1/2).pdf",
          }),
        ],
      }),
    );

    expect(document.getElementById("split-stem-pdf-d1-solo")).toBeNull();
    expect(
      document.querySelector(
        '[aria-label="Download Lecture notes (1/2).pdf"]',
      ),
    ).toBeTruthy();
  });

  it("prefixes stem captions with deck title when showDeckTitle", async () => {
    await render(
      createElement(MaterialsList, {
        showDeckTitle: true,
        onChanged: vi.fn(),
        materials: [
          material({
            id: "a1",
            deck_id: "deck-a",
            deck_title: "Deck A",
            kind: "pdf",
            filename: "Lecture (1/2).pdf",
          }),
          material({
            id: "a2",
            deck_id: "deck-a",
            deck_title: "Deck A",
            kind: "pdf",
            filename: "Lecture (2/2).pdf",
          }),
          material({
            id: "b1",
            deck_id: "deck-b",
            deck_title: "Deck B",
            kind: "pdf",
            filename: "Lecture (1/2).pdf",
          }),
          material({
            id: "b2",
            deck_id: "deck-b",
            deck_title: "Deck B",
            kind: "pdf",
            filename: "Lecture (2/2).pdf",
          }),
        ],
      }),
    );

    expect(document.getElementById("split-stem-pdf-deck-a-a1")?.textContent).toBe(
      "Deck A · Lecture",
    );
    expect(document.getElementById("split-stem-pdf-deck-b-b1")?.textContent).toBe(
      "Deck B · Lecture",
    );
    // Stem caption owns deck disambiguation; nested rows omit per-row deck links.
    expect(
      document.querySelectorAll('a[href="/library/decks/deck-a"]').length,
    ).toBe(0);
    expect(
      document.querySelectorAll('a[href="/library/decks/deck-b"]').length,
    ).toBe(0);
  });
});
