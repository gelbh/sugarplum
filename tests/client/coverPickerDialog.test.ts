/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, searchCovers } from "../../src/api/client";
import CoverPickerDialog from "../../src/components/CoverPickerDialog";

vi.mock("../../src/api/client", () => {
  class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  return {
    ApiError,
    searchCovers: vi.fn(),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function renderDialog(): Promise<void> {
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(CoverPickerDialog, {
        open: true,
        title: "Anatomy",
        onClose: () => {},
        onPick: () => {},
        onClear: () => {},
      }),
    );
  });
}

describe("CoverPickerDialog", () => {
  it("says when cover search is not configured, and stays empty otherwise", async () => {
    vi.mocked(searchCovers).mockRejectedValueOnce(
      new ApiError(503, "Cover search is not configured"),
    );
    await renderDialog();
    expect(document.body.textContent).toContain("Cover search is not configured");
    expect(document.body.textContent).not.toContain("No photos for this title.");

    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.replaceChildren();

    vi.mocked(searchCovers).mockResolvedValueOnce([]);
    await renderDialog();
    expect(document.body.textContent).toContain("No photos for this title.");
    expect(document.body.textContent).not.toContain("Cover search is not configured");
  });
});
