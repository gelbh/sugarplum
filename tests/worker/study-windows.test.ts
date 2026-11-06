import { describe, expect, it } from "vitest";
import type { CardDraft } from "../../worker/generation/schema";
import {
  filterNovelDrafts,
  isNearDuplicateFront,
  mergeWindowResumes,
  prepareStudySource,
} from "../../worker/generation/study-windows";

const toc = `Table of contents
Introduction .... 1
Life cycle .... 4
Treatment .... 9
Diagnosis .... 12
Prevention .... 15
References .... 40`;

const facts = `Eimeria tenella infects the cecum of chickens and causes bloody diarrhea. The site of infection is the cecum. Amprolium is used for treatment. Oocysts sporulate outside the host.`;

const other = `Histomonas meleagridis causes blackhead in turkeys. The parasite is carried by Heterakis gallinarum. Lesions form in the ceca and the liver.`;

function source(
  pages: Array<{ page: number; text: string }>,
  extra?: Partial<Parameters<typeof prepareStudySource>[0]>,
) {
  return prepareStudySource({
    pages,
    limit: 4,
    pageStart: 1,
    pageEnd: pages.at(-1)?.page ?? 1,
    totalPages: pages.at(-1)?.page ?? 1,
    ...extra,
  });
}

describe("prepareStudySource", () => {
  it("skips a contents page when a fact page exists", () => {
    const prepared = source([
      { page: 1, text: toc },
      { page: 2, text: facts },
    ]);
    expect(prepared.text).toContain("cecum");
    expect(prepared.text).not.toContain("Table of contents");
  });

  it("keeps a contents page when it is the only text", () => {
    const prepared = source([{ page: 1, text: toc }]);
    expect(prepared.text).toContain("Table of contents");
  });

  it("prefers the page that contains the topic hint", () => {
    const prepared = source(
      [
        { page: 1, text: other },
        { page: 2, text: facts },
      ],
      { topicHints: ["amprolium"], limit: 1 },
    );
    expect(prepared.text).toContain("Amprolium");
    expect(prepared.text).not.toContain("Histomonas");
  });

  it("skips a window that was already used", () => {
    const first = source(
      [
        { page: 1, text: facts },
        { page: 2, text: other },
      ],
      { limit: 1 },
    );
    const second = source(
      [
        { page: 1, text: facts },
        { page: 2, text: other },
      ],
      { limit: 1, usedKeys: first.resume.used_keys },
    );
    expect(second.text.length).toBeGreaterThan(0);
    expect(second.text).not.toContain(first.text.slice(0, 24));
    expect(second.resume.next_page).toBe(3);
  });

  it("marks short slides used so a later pass moves on", () => {
    const pages = [
      { page: 1, text: "Overview" },
      { page: 2, text: "Goals" },
      { page: 3, text: "Agenda" },
      { page: 4, text: "Break" },
      { page: 5, text: facts },
    ];
    const first = source(pages, { limit: 4 });
    const second = source(pages, {
      limit: 4,
      usedKeys: first.resume.used_keys,
    });
    expect(second.text).not.toContain(facts.slice(0, 24));
    expect(second.resume.next_page).toBe(6);
  });

  it("keeps a sibling section that shares life-cycle wording", () => {
    const shared =
      "life cycle includes sporulation oocyst ingestion schizont merozoite gamete bloody diarrhea site infection treatment amprolium chicken";
    const tenella = `Eimeria tenella ${shared} cecum`;
    const necatrix = `Eimeria necatrix ${shared} intestine`;
    const first = source(
      [
        { page: 1, text: tenella },
        { page: 2, text: necatrix },
      ],
      { limit: 1 },
    );
    const second = source(
      [
        { page: 1, text: tenella },
        { page: 2, text: necatrix },
      ],
      { limit: 1, usedKeys: first.resume.used_keys },
    );
    expect(second.text.length).toBeGreaterThan(0);
    expect(second.text).not.toContain(first.text.slice(0, 24));
  });

  it("revisits a used window when the topic hint is in it", () => {
    const first = source(
      [
        { page: 1, text: facts },
        { page: 2, text: other },
      ],
      { limit: 1 },
    );
    const again = source(
      [
        { page: 1, text: facts },
        { page: 2, text: other },
      ],
      { limit: 1, topicHints: ["amprolium"], usedKeys: first.resume.used_keys },
    );
    expect(again.text).toContain("Amprolium");
  });
});

describe("mergeWindowResumes", () => {
  it("starts at the furthest next page and unions keys", () => {
    const merged = mergeWindowResumes([
      JSON.stringify({
        window_resume: { used_keys: ["a b c"], next_page: 1, total_pages: 10 },
      }),
      JSON.stringify({
        window_resume: {
          used_keys: ["d e f", "a b c"],
          next_page: 4,
          total_pages: 10,
        },
      }),
    ]);
    expect(merged.startPage).toBe(4);
    expect(merged.usedKeys).toEqual(["a b c", "d e f"]);
  });

  it("keeps the newest keys when the caller passes chronological order", () => {
    const newest = Array.from({ length: 80 }, (_, i) => `new${i}`);
    const merged = mergeWindowResumes([
      JSON.stringify({
        window_resume: { used_keys: ["old"], next_page: 1, total_pages: 200 },
      }),
      JSON.stringify({
        window_resume: { used_keys: newest, next_page: 9, total_pages: 200 },
      }),
    ]);
    expect(merged.usedKeys).toEqual(newest);
    expect(merged.startPage).toBe(9);
  });
});

describe("near-duplicate fronts", () => {
  it("drops a paraphrase and keeps a different species", () => {
    expect(
      isNearDuplicateFront(
        "What is the definitive host of Eimeria tenella?",
        ["Definitive host of Eimeria tenella"],
      ),
    ).toBe(true);
    expect(
      isNearDuplicateFront("Host of Eimeria tenella", [
        "Host of Eimeria necatrix",
      ]),
    ).toBe(false);
    expect(
      isNearDuplicateFront(
        "What is the site of infection for Eimeria acervulina?",
        ["What is the site of infection for Eimeria tenella?"],
      ),
    ).toBe(false);
  });

  it("filters novel drafts against the deck and the batch", () => {
    const drafts: CardDraft[] = [
      {
        type: "qa",
        front: "Definitive host of Eimeria tenella?",
        back: "chicken",
        provenance: { pages: [1], excerpt: "cecum" },
      },
      {
        type: "qa",
        front: "Host of Eimeria necatrix",
        back: "chicken",
        provenance: { pages: [2], excerpt: "intestine" },
      },
    ];
    const kept = filterNovelDrafts(drafts, [
      "What is the definitive host of Eimeria tenella?",
    ]);
    expect(kept.map((d) => d.front)).toEqual(["Host of Eimeria necatrix"]);
  });
});
