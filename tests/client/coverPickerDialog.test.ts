/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  searchCovers,
  setCover,
  uploadCoverFile,
} from "../../src/api/client";
import CoverPickerDialog from "../../src/deckHub/CoverPickerDialog";

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
    setCover: vi.fn(),
    uploadCoverFile: vi.fn(),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];

function emptySearch(page = 1) {
  return { photos: [] as const, page, totalPages: 1 };
}

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
    onSaved: (row: unknown) => void;
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
        onSaved: props?.onSaved ?? (() => {}),
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
    expect(document.body.textContent).toContain(
      "Cover search is not configured",
    );
    expect(document.body.textContent).not.toContain(
      "No Unsplash photos matched",
    );

    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.replaceChildren();

    vi.mocked(searchCovers).mockResolvedValueOnce(emptySearch());
    await renderDialog();
    expect(document.body.textContent).toContain("No Unsplash photos matched");
    expect(document.body.textContent).not.toContain(
      "Cover search is not configured",
    );
  });

  it("searches with an edited query", async () => {
    vi.mocked(searchCovers).mockResolvedValue(emptySearch());
    await renderDialog();
    expect(searchCovers).toHaveBeenCalledWith("Anatomy", 1);

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
      document.body
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click();
    });
    expect(searchCovers).toHaveBeenCalledWith("heart anatomy", 1);
  });

  it("uploads a custom cover file", async () => {
    vi.mocked(searchCovers).mockResolvedValue(emptySearch());
    const uploaded = {
      ownerKind: "subject" as const,
      ownerId: "sub-1",
      photoId: "img-1",
      imageUrl: "/api/covers/media?key=covers%2Fx.jpg",
      source: "custom" as const,
      r2Key: "covers/user-a/subject/sub-1/img-1.jpg",
    };
    vi.mocked(uploadCoverFile).mockResolvedValueOnce(uploaded);
    const onSaved = vi.fn();
    await renderDialog({ onSaved });

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
    expect(onSaved).toHaveBeenCalledWith(uploaded);
  });

  it("saves an Unsplash pick through setCover", async () => {
    const photo = {
      photoId: "p1",
      imageUrl: "https://images.unsplash.com/p1",
      photographerName: "Ada",
      photographerUrl: "https://unsplash.com/@ada",
      photoHtmlUrl: "https://unsplash.com/photos/p1",
    };
    const saved = {
      ...photo,
      source: "unsplash" as const,
      ownerKind: "subject" as const,
      ownerId: "sub-1",
    };
    vi.mocked(searchCovers).mockResolvedValueOnce({
      photos: [photo],
      page: 1,
      totalPages: 1,
    });
    vi.mocked(setCover).mockResolvedValueOnce(saved);
    const onSaved = vi.fn();
    await renderDialog({ onSaved });

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="Photo by Ada"]')
        ?.click();
    });
    expect(setCover).toHaveBeenCalledWith("subject", "sub-1", "p1");
    expect(onSaved).toHaveBeenCalledWith(saved);
  });
});
