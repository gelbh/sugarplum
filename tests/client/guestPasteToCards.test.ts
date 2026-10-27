import { describe, expect, it } from "vitest";
import { guestPasteToCards } from "../../src/guest/pasteToCards";

describe("guestPasteToCards", () => {
  it("splits blank-line paragraphs into front/back", () => {
    const { cards } = guestPasteToCards(
      "What is mitochondria?\nPowerhouse of the cell.\n\nSecond fact paragraph that is long enough.",
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0]?.front).toMatch(/mitochondria/i);
  });

  it("uses first colon as front/back split", () => {
    const { cards } = guestPasteToCards(
      "Term: definition that is long enough.",
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      front: "Term",
      back: "definition that is long enough.",
    });
  });

  it("does not colon-split URLs, times, or drive letters", () => {
    const url = guestPasteToCards(
      "See https://en.wikipedia.org/wiki/Cell for more detail here.",
    );
    expect(url.cards).toHaveLength(1);
    expect(url.cards[0]?.front).toMatch(/See https/i);
    expect(url.cards[0]?.front).not.toBe("See https");

    const time = guestPasteToCards(
      "Meeting notes 3:30 discussion about osmosis in the lab.",
    );
    expect(time.cards).toHaveLength(1);
    expect(time.cards[0]?.front).not.toBe("Meeting notes 3");

    const drive = guestPasteToCards(
      "C:\\Users\\notes about mitochondria and ATP energy.",
    );
    expect(drive.cards).toHaveLength(1);
    expect(drive.cards[0]?.front).not.toBe("C");
  });

  it("uses question line as front when a line ends with ?", () => {
    const { cards } = guestPasteToCards(
      "Context line that is long enough.\nWhat is ATP?\nEnergy currency of the cell.",
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.front).toBe("What is ATP?");
    expect(cards[0]?.back).toContain("Energy currency");
  });

  it("returns empty cards for empty or tiny paste", () => {
    expect(guestPasteToCards("")).toEqual({ cards: [], truncated: false });
    expect(guestPasteToCards("hi")).toEqual({ cards: [], truncated: false });
  });

  it("caps at 40 cards and flags truncation", () => {
    const chunks = Array.from(
      { length: 50 },
      (_, i) => `Question ${i}?\nAnswer ${i}.`,
    ).join("\n\n");
    const { cards, truncated } = guestPasteToCards(chunks);
    expect(cards).toHaveLength(40);
    expect(truncated).toBe(true);
  });
});
