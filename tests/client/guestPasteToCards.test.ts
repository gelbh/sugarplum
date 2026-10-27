import { describe, expect, it } from "vitest";
import { guestPasteToCards } from "../../src/guest/pasteToCards";

describe("guestPasteToCards", () => {
  it("splits blank-line paragraphs into front/back", () => {
    const cards = guestPasteToCards(
      "What is mitochondria?\nPowerhouse of the cell.\n\nSecond fact paragraph that is long enough.",
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0]?.front).toMatch(/mitochondria/i);
  });

  it("uses first colon as front/back split", () => {
    const cards = guestPasteToCards("Term: definition that is long enough.");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      front: "Term",
      back: "definition that is long enough.",
    });
  });

  it("uses question line as front when a line ends with ?", () => {
    const cards = guestPasteToCards(
      "Context line that is long enough.\nWhat is ATP?\nEnergy currency of the cell.",
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.front).toBe("What is ATP?");
    expect(cards[0]?.back).toContain("Energy currency");
  });

  it("returns [] for empty or tiny paste", () => {
    expect(guestPasteToCards("")).toEqual([]);
    expect(guestPasteToCards("hi")).toEqual([]);
  });

  it("caps at 40 cards", () => {
    const chunks = Array.from({ length: 50 }, (_, i) => `Question ${i}?\nAnswer ${i}.`).join(
      "\n\n",
    );
    expect(guestPasteToCards(chunks)).toHaveLength(40);
  });
});
