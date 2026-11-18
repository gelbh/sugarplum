/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import StageBreadcrumbs from "../../src/ui/StageBreadcrumbs";
import { theme } from "../../src/theme";

vi.mock("../../src/nav/navigate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/nav/navigate")>();
  return {
    ...actual,
    navigate: vi.fn(),
  };
});

import { navigate } from "../../src/nav/navigate";

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
  vi.mocked(navigate).mockClear();
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

describe("StageBreadcrumbs", () => {
  it("renders nothing when crumbs are empty", async () => {
    await render(createElement(StageBreadcrumbs, { crumbs: [] }));
    expect(document.querySelector('[aria-label="Breadcrumb"]')).toBeNull();
  });

  it("renders crumb labels and navigates on plain click", async () => {
    await render(
      createElement(StageBreadcrumbs, {
        crumbs: [
          { label: "Library", href: "/library" },
          { label: "Subject", href: "/subject/1" },
        ],
      }),
    );

    const nav = document.querySelector('[aria-label="Breadcrumb"]');
    expect(nav).not.toBeNull();
    expect(nav?.textContent).toContain("Library");
    expect(nav?.textContent).toContain("Subject");

    const link = document.querySelector('a[href="/library"]');
    expect(link).not.toBeNull();
    await act(async () => {
      link?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(navigate).toHaveBeenCalledWith("/library");
  });
});
