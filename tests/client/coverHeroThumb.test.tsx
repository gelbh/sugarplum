/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoverHeroThumb from "../../src/ui/CoverHeroThumb";
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

describe("CoverHeroThumb", () => {
  it("renders the cover image when src is set", async () => {
    await render(
      createElement(CoverHeroThumb, {
        src: "https://example.com/cover.jpg",
        placeholderColor: "#123456",
        interactive: false,
      }),
    );

    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/cover.jpg");
  });

  it("is clickable when interactive with onChangeCover", async () => {
    const onChangeCover = vi.fn();
    await render(
      createElement(CoverHeroThumb, {
        src: "https://example.com/cover.jpg",
        placeholderColor: "#123456",
        interactive: true,
        onChangeCover,
        ariaLabel: "Change cover for Anatomy",
      }),
    );

    const button = document.querySelector(
      '[aria-label="Change cover for Anatomy"]',
    );
    expect(button).not.toBeNull();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChangeCover).toHaveBeenCalledTimes(1);
  });

  it("renders Unsplash credit link when credit is provided", async () => {
    await render(
      createElement(CoverHeroThumb, {
        src: "https://example.com/cover.jpg",
        placeholderColor: "#123456",
        interactive: false,
        credit: {
          photographerName: "Ada Lovelace",
          photographerUrl: "https://unsplash.com/@ada",
        },
      }),
    );

    const link = document.querySelector(
      'a[href="https://unsplash.com/@ada"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("Ada Lovelace");
    expect(link?.rel).toContain("noopener");
    expect(document.body.textContent).toContain("Photo by");
  });

  it("omits credit UI when credit is absent", async () => {
    await render(
      createElement(CoverHeroThumb, {
        src: null,
        placeholderColor: "#abcdef",
        interactive: false,
      }),
    );

    expect(document.querySelector("a")).toBeNull();
    expect(document.body.textContent).not.toContain("Photo by");
    expect(document.querySelector("img")).toBeNull();
  });
});
