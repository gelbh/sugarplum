/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import MaterialsList from "../../src/components/MaterialsList";
import type { MaterialListItem } from "../../src/api/client";
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
      document.querySelectorAll('[aria-label="Download"]').length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('[aria-label="Delete"]').length,
    ).toBeGreaterThan(0);
  });
});
