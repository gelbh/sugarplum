/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { CardType } from "../../src/api/client";
import {
  SelectEnumItem,
  renderSelectEnumValue,
} from "../../src/shared/ui/SelectEnumItem";
import { CARD_TYPE_ICONS } from "../../src/shared/ui/cardTypeIcons";
import { TYPE_LABELS } from "../../src/draftReview/draftCardModel";
import { SOURCE_ROLES } from "../../src/materials/sourceRole";
import { SOURCE_ROLE_ICONS } from "../../src/materials/sourceRoleIcons";

const CARD_TYPES = Object.keys(TYPE_LABELS) as CardType[];

describe("typed select icon maps", () => {
  it("covers every CardType", () => {
    for (const t of CARD_TYPES) {
      expect(CARD_TYPE_ICONS[t]).toBeTypeOf("object");
    }
  });

  it("covers every SourceRole", () => {
    for (const role of SOURCE_ROLES) {
      expect(SOURCE_ROLE_ICONS[role]).toBeTypeOf("object");
    }
  });


});

describe("SelectEnumItem", () => {
  let root: Root | null = null;
  let el: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    el?.remove();
    root = null;
    el = null;
  });

  it("renders the label", () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => {
      root!.render(
        createElement(SelectEnumItem, {
          icon: CARD_TYPE_ICONS.qa,
          label: "Q&A",
        }),
      );
    });
    expect(el.textContent).toContain("Q&A");
  });

  it("renderSelectEnumValue exposes the label", () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => {
      root!.render(
        createElement(
          "div",
          null,
          renderSelectEnumValue({
            icon: CARD_TYPE_ICONS.mcq,
            label: "Multiple choice",
          }),
        ),
      );
    });
    expect(el.textContent).toContain("Multiple choice");
  });
});
