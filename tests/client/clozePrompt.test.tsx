/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import ClozePrompt from "../../src/study/ClozePrompt";
import ClozeReveal from "../../src/study/ClozeReveal";
import { clozeSpoken } from "../../src/study/clozeFormat";

describe("ClozePrompt", () => {
  let root: Root | null = null;
  let el: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    el?.remove();
    root = null;
    el = null;
  });

  function mount(front: string) {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => root?.render(createElement(ClozePrompt, { front })));
    return el;
  }

  it("renders a named blank and hides the answer", () => {
    const node = mount("phylum {{c1::Amoebozoa}} and order");
    expect(node.textContent).toContain("phylum ");
    expect(node.textContent).toContain("blank");
    expect(node.textContent).toContain(" and order");
    expect(node.textContent).not.toContain("Amoebozoa");
    expect(node.textContent).not.toContain("[…]");
  });

  it("shows a hint instead of the blank", () => {
    const node = mount("The capital is {{c1::Paris::city of light}}.");
    expect(node.textContent).toContain("city of light");
    expect(node.textContent).not.toContain("blank");
    expect(node.textContent).not.toContain("Paris");
  });
});

describe("ClozeReveal", () => {
  let root: Root | null = null;
  let el: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    el?.remove();
    root = null;
    el = null;
  });

  it("shows the full sentence with answers emphasized", () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() =>
      root?.render(
        createElement(ClozeReveal, {
          front: "The {{c1::cat}} sat on the {{c2::mat}}",
        }),
      ),
    );
    expect(el.textContent).toBe("The cat sat on the mat");
    const marks = el.querySelectorAll("span");
    expect([...marks].map((n) => n.textContent)).toEqual(["cat", "mat"]);
  });
});

describe("clozeSpoken", () => {
  it("speaks the word blank", () => {
    expect(clozeSpoken("phylum {{c1::Amoebozoa}} and order")).toBe(
      "phylum blank and order",
    );
  });
});
