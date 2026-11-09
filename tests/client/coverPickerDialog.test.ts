/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, searchCovers, uploadCoverFile } from "../../src/api/client";
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
    uploadCoverFile: vi.fn(),
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

async function renderDialog(
  props?: Partial<{
    onUploaded: (row: unknown) => void;
  }>,
): Promise<void> {
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(CoverPickerDialog, {
        open: true,
        title: "Anatomy",
        ownerKind: "subject",
        ownerId: "sub-1",
        onClose: () => {},
        onPick: () => {},
        onUploaded: props?.onUploaded ?? (() => {}),
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

  it("searches with an edited query", async () => {
    vi.mocked(searchCovers).mockResolvedValue([]);
    await renderDialog();
    expect(searchCovers).toHaveBeenCalledWith("Anatomy");

    const input = document.body.querySelector(
      'input[type="text"], input:not([type="file"])',
    ) as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(input, "heart anatomy");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      document.body.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(searchCovers).toHaveBeenCalledWith("heart anatomy");
  });

  it("uploads a custom cover file", async () => {
    vi.mocked(searchCovers).mockResolvedValue([]);
    const uploaded = {
      ownerKind: "subject" as const,
      ownerId: "sub-1",
      photoId: "img-1",
      imageUrl: "/api/covers/media?key=covers%2Fx.jpg",
      photographerName: "",
      photographerUrl: "",
      photoHtmlUrl: "",
      source: "custom" as const,
      r2Key: "covers/user-a/subject/sub-1/img-1.jpg",
    };
    vi.mocked(uploadCoverFile).mockResolvedValueOnce(uploaded);
    const onUploaded = vi.fn();
    await renderDialog({ onUploaded });

    const fileInput = document.body.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "cover.jpg", {
      type: "image/jpeg",
    });
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [file] });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(uploadCoverFile).toHaveBeenCalledWith("subject", "sub-1", file);
    expect(onUploaded).toHaveBeenCalledWith(uploaded);
  });
});
