import { describe, expect, it } from "vitest";
import type { CardDraftView } from "../../src/api/client";
import {
  draftFaceKind,
  draftForType,
  mcqDraftFromCard,
  starterOcclusionFront,
  typeSelectModel,
} from "../../src/lib/draftCardModel";
import { pickCorrect } from "../../src/lib/mcqDraftEdit";

function card(partial: Partial<CardDraftView>): CardDraftView {
  return {
    id: "c1",
    deck_id: "d1",
    job_id: null,
    type: "qa",
    front: "Capital of France?",
    back: "Paris",
    provenance: null,
    status: "draft",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("draftForType", () => {
  it("seeds MCQ options from a qa card and keeps the matching answer", () => {
    expect(draftForType(card({ back: " Paris " }), "mcq")).toEqual({
      front: "Capital of France?",
      back: "Paris",
      type: "mcq",
      options: ["Paris", "", ""],
    });
  });

  it("falls back to the first non-empty option when the answer is not a choice", () => {
    const mcq = card({ type: "qa", back: "Lyon", options: ["", "Rome", "Oslo"] });
    expect(draftForType(mcq, "mcq").back).toBe("Rome");
  });

  it("keeps text when switching mcq to qa", () => {
    const mcq = card({ type: "mcq", back: "Paris", options: ["Paris", "Rome", "Oslo"] });
    expect(draftForType(mcq, "qa")).toEqual({
      front: "Capital of France?",
      back: "Paris",
      type: "qa",
    });
  });

  it("returns a starter occlusion front for occlusion", () => {
    expect(
      draftForType(card({ type: "image_label", media_r2_keys: ["img1"] }), "occlusion"),
    ).toEqual({
      front: starterOcclusionFront("img1"),
      back: { answer: "r1" },
      type: "occlusion",
    });
  });
});

describe("typeSelectModel", () => {
  const diy = ["qa", "cloze", "mcq"] as const;

  it("locks image_label to itself under DIY allowedTypes", () => {
    expect(typeSelectModel("image_label", [...diy])).toEqual({
      value: "image_label",
      options: ["image_label"],
      locked: true,
    });
  });

  it("locks occlusion without allowedTypes", () => {
    expect(typeSelectModel("occlusion")).toEqual({
      value: "occlusion",
      options: ["occlusion"],
      locked: true,
    });
  });

  it("leaves plain qa unlocked with the full option list", () => {
    expect(typeSelectModel("qa")).toEqual({
      value: "qa",
      options: ["qa", "cloze", "image_label", "diagram", "mcq"],
      locked: false,
    });
  });
});

describe("draftFaceKind", () => {
  it("classifies occlusion, mcq and text cards", () => {
    expect(
      draftFaceKind(
        card({ type: "occlusion", front: starterOcclusionFront("k"), back: { answer: "r1" } }),
      ),
    ).toBe("occlusion");
    expect(draftFaceKind(card({ type: "mcq" }))).toBe("mcq");
    expect(draftFaceKind(card({ type: "cloze" }))).toBe("text");
  });
});

describe("mcqDraftFromCard", () => {
  it("uses card options as-is and the back answer", () => {
    expect(
      mcqDraftFromCard(card({ type: "mcq", back: { answer: "b" }, options: ["a", "b"] })),
    ).toEqual({ options: ["a", "b"], back: "b" });
  });
});

describe("pickCorrect", () => {
  it("never matches an empty preferred answer", () => {
    expect(pickCorrect(["", "Rome"], "")).toBe("Rome");
    expect(pickCorrect(["", ""], " ")).toBe("");
  });
});
