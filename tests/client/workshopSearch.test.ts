import { describe, expect, it } from "vitest";
import type { CardDraftView, MaterialListItem } from "../../src/api/client";
import {
  cardMatchesWorkshopQuery,
  materialMatchesWorkshopQuery,
  normalizeWorkshopQuery,
} from "../../src/deckHub/workshopSearch";

function card(
  partial: Partial<CardDraftView> &
    Pick<CardDraftView, "id" | "front" | "type">,
): CardDraftView {
  return {
    deck_id: "d1",
    job_id: null,
    back: "",
    provenance: null,
    status: "accepted",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function material(
  partial: Partial<MaterialListItem> & Pick<MaterialListItem, "id" | "kind">,
): MaterialListItem {
  return {
    deck_id: "d1",
    r2_key: "k",
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("workshopSearch", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeWorkshopQuery("  Foo   BAR ")).toBe("foo bar");
  });

  it("empty query matches every card and material", () => {
    expect(
      cardMatchesWorkshopQuery(
        card({ id: "1", front: "Hepatic", type: "qa" }),
        "",
      ),
    ).toBe(true);
    expect(
      materialMatchesWorkshopQuery(material({ id: "1", kind: "pdf" }), "   "),
    ).toBe(true);
  });

  it("matches card front preview case-insensitively", () => {
    const c = card({
      id: "1",
      front: "Fasciola hepatica life cycle",
      type: "qa",
    });
    expect(cardMatchesWorkshopQuery(c, "HEPatica")).toBe(true);
    expect(cardMatchesWorkshopQuery(c, "missing")).toBe(false);
  });

  it("matches card type label", () => {
    const c = card({ id: "1", front: "Pick one", type: "mcq" });
    expect(cardMatchesWorkshopQuery(c, "mcq")).toBe(true);
  });

  it("matches material filename and kind label", () => {
    const m = material({ id: "1", kind: "pdf", filename: "Lecture-03.pdf" });
    expect(materialMatchesWorkshopQuery(m, "lecture")).toBe(true);
    expect(materialMatchesWorkshopQuery(m, "pdf")).toBe(true);
    expect(materialMatchesWorkshopQuery(m, "pptx")).toBe(false);
  });

  it("uses kind fallback title when filename missing", () => {
    const m = material({ id: "1", kind: "paste", filename: null });
    expect(materialMatchesWorkshopQuery(m, "text")).toBe(true);
  });
});
