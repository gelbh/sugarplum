/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigate } from "../../src/shared/nav/navigate";
import TodayDueBreakdown from "../../src/study/TodayDueBreakdown";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../../src/shared/nav/navigate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/shared/nav/navigate")>();
  return {
    ...actual,
    navigate: vi.fn(),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("TodayDueBreakdown", () => {
  it("shows new/review, deck links, remainder; no held copy", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(TodayDueBreakdown, {
          introUsed: 12,
          reviewUsed: 73,
          rows: [
            { deckId: "a", title: "Parasites", count: 31 },
            { deckId: "b", title: "Cell biology", count: 28 },
            { deckId: "c", title: "Neuro", count: 16 },
          ],
          remainder: { deckCount: 2, cardCount: 10 },
        }),
      );
    });
    const text = host.textContent ?? "";
    expect(text).toContain("12");
    expect(text).toContain("new");
    expect(text).toContain("73");
    expect(text).toContain("review");
    expect(text).toContain("Parasites");
    expect(text).toContain("2 more decks");
    expect(text.toLowerCase()).not.toContain("held");
    expect(text.toLowerCase()).not.toContain("intro budget");
    expect(text.toLowerCase()).not.toContain("waiting");
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "12 new, 73 review",
    );
    const link = host.querySelector('a[href="/study?deckId=a"]');
    expect(link).not.toBeNull();
    act(() => {
      link?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(navigate).toHaveBeenCalledWith("/study?deckId=a");
    host.remove();
  });

  it("From without split when intro/review null", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(TodayDueBreakdown, {
          introUsed: null,
          reviewUsed: null,
          rows: [{ deckId: "a", title: "Parasites", count: 3 }],
          remainder: null,
        }),
      );
    });
    expect(host.querySelector('[role="img"]')).toBeNull();
    expect(host.textContent).toContain("Parasites");
    expect(host.textContent).not.toContain("new ·");
    host.remove();
  });

  it("modified click keeps href navigation", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(TodayDueBreakdown, {
          introUsed: null,
          reviewUsed: null,
          rows: [{ deckId: "a", title: "Parasites", count: 3 }],
          remainder: null,
        }),
      );
    });
    const link = host.querySelector('a[href="/study?deckId=a"]');
    expect(link).not.toBeNull();
    // Stop jsdom follow-through; assert SPA navigate stayed out of the way.
    link?.addEventListener("click", (e) => e.preventDefault(), {
      capture: true,
    });
    act(() => {
      link?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          metaKey: true,
        }),
      );
    });
    expect(navigate).not.toHaveBeenCalled();
    host.remove();
  });
});
