import { describe, expect, it } from "vitest";
import {
  isStoredDraftSafe,
  mapStoredDraftToQualityDraft,
  partitionStoredDraftsByQuality,
} from "../../worker/generation/storedDraftQuality";

describe("mapStoredDraftToQualityDraft", () => {
  it("maps a good QA stored card", () => {
    const mapped = mapStoredDraftToQualityDraft({
      type: "qa",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
      provenance: { pages: [1], excerpt: "ATP" },
    });
    expect(mapped).toMatchObject({
      type: "qa",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
    });
    expect(isStoredDraftSafe({
      type: "qa",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
      provenance: { pages: [1], excerpt: "ATP" },
    })).toBe(true);
  });

  it("rejects junk QA that fails quality", () => {
    expect(
      isStoredDraftSafe({
        type: "qa",
        front: "Phylum",
        back: "Hosts Family",
        provenance: { pages: [1], excerpt: "table" },
      }),
    ).toBe(false);
  });

  it("treats unmappable occlusion as unsafe", () => {
    expect(
      mapStoredDraftToQualityDraft({
        type: "occlusion",
        front: "not-an-object",
        back: "nope",
      }),
    ).toBeNull();
    expect(
      isStoredDraftSafe({
        type: "occlusion",
        front: "not-an-object",
        back: "nope",
      }),
    ).toBe(false);
  });

  it("keeps schema-valid occlusion as safe (quality passes occlusion through)", () => {
    const front = {
      image_key: "r2/img",
      regions: [
        { id: "r1", x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: "label" },
      ],
      mode: "hide_one" as const,
    };
    expect(
      isStoredDraftSafe({
        type: "occlusion",
        front,
        back: { answer: "r1" },
        provenance: { pages: [1], excerpt: "fig" },
      }),
    ).toBe(true);
  });

  it("maps nested MCQ back JSON shape", () => {
    expect(
      isStoredDraftSafe({
        type: "mcq",
        front: "What is ATP?",
        back: {
          answer: "Adenosine triphosphate",
          options: ["Adenosine triphosphate", "Glucose", "DNA"],
        },
        provenance: { pages: [1], excerpt: "ATP" },
      }),
    ).toBe(true);
  });

  it("partitions mixed safe and unsafe", () => {
    const rows = [
      {
        id: "good",
        type: "qa",
        front: "What is ATP?",
        back: "Adenosine triphosphate",
        provenance: { pages: [1], excerpt: "ATP" },
      },
      {
        id: "junk",
        type: "qa",
        front: "Phylum",
        back: "Hosts",
        provenance: { pages: [1], excerpt: "t" },
      },
    ];
    const { safe, unsafe } = partitionStoredDraftsByQuality(rows);
    expect(safe.map((r) => r.id)).toEqual(["good"]);
    expect(unsafe.map((r) => r.id)).toEqual(["junk"]);
  });

  it("batch partition drops duplicate fronts that solo isStoredDraftSafe would keep", () => {
    const rows = [
      {
        id: "first",
        type: "qa",
        front: "What is ATP?",
        back: "Adenosine triphosphate",
        provenance: { pages: [1], excerpt: "ATP" },
      },
      {
        id: "dup",
        type: "qa",
        front: "What is ATP?",
        back: "Energy currency of the cell",
        provenance: { pages: [1], excerpt: "ATP" },
      },
    ];
    expect(isStoredDraftSafe(rows[0]!)).toBe(true);
    expect(isStoredDraftSafe(rows[1]!)).toBe(true);
    const { safe, unsafe } = partitionStoredDraftsByQuality(rows);
    expect(safe.map((r) => r.id)).toEqual(["first"]);
    expect(unsafe.map((r) => r.id)).toEqual(["dup"]);
  });
});
