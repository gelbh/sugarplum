import { describe, it, expect } from "vitest";
import { cardToAnkiNotes } from "../../worker/export/notes";

describe("cardToAnkiNotes", () => {
  it("maps qa to basic Front and Back", () => {
    expect(
      cardToAnkiNotes({
        type: "qa",
        front: "What is ATP?",
        back: "Adenosine triphosphate",
      }),
    ).toEqual([
      {
        model: "basic",
        fields: { Front: "What is ATP?", Back: "Adenosine triphosphate" },
      },
    ]);
  });

  it("maps cloze to cloze Text and Extra", () => {
    expect(
      cardToAnkiNotes({
        type: "cloze",
        front: "{{c1::mitochondria}} produce ATP",
        back: "Powerhouse detail",
      }),
    ).toEqual([
      {
        model: "cloze",
        fields: {
          Text: "{{c1::mitochondria}} produce ATP",
          Extra: "Powerhouse detail",
        },
      },
    ]);
  });

  it("maps mcq to sugarplum_mcq with newline-joined options", () => {
    expect(
      cardToAnkiNotes({
        type: "mcq",
        front: "Pick the organelle",
        back: "Mitochondria",
        options: ["Nucleus", "Mitochondria", "Ribosome"],
      }),
    ).toEqual([
      {
        model: "sugarplum_mcq",
        fields: {
          Front: "Pick the organelle",
          Options: "Nucleus\nMitochondria\nRibosome",
          Answer: "Mitochondria",
        },
      },
    ]);
  });

  it("skips unknown card types", () => {
    expect(
      cardToAnkiNotes({
        type: "flashcard_v2",
        front: "Q",
        back: "A",
      }),
    ).toEqual({ skip: true, reason: "unsupported-type:flashcard_v2" });
  });

  it("maps one Anki note per occlusion region with mask geometry", () => {
    const result = cardToAnkiNotes({
      type: "occlusion",
      front: {
        image_key: "materials/deck-a/fig.png",
        mode: "hide_one",
        regions: [
          { id: "r1", x: 0.1, y: 0.2, w: 0.3, h: 0.4, label: "Femur" },
          { id: "r2", x: 0.5, y: 0.5, w: 0.2, h: 0.1, label: "  " },
        ],
      },
      back: { answer: "fallback-label" },
    });
    expect("skip" in result).toBe(false);
    if ("skip" in result) return;
    expect(result).toHaveLength(2);
    expect(result[0]?.model).toBe("sugarplum_occlusion");
    expect(result[0]?.fields.Front).toContain(
      `src="${encodeURIComponent("materials/deck-a/fig.png")}"`,
    );
    expect(result[0]?.fields.Front).toContain("left:10%");
    expect(result[0]?.fields.Front).toContain("top:20%");
    expect(result[0]?.fields.Front).toContain("width:30%");
    expect(result[0]?.fields.Front).toContain("height:40%");
    expect(result[0]?.fields.Front).toContain("rgba(0,0,0,.85)");
    expect(result[0]?.fields.Back).toContain("border:2px solid #f57c00");
    expect(result[0]?.fields.Back).toContain("Femur");
    expect(result[1]?.fields.Back).toContain("fallback-label (r2)");
    expect(result[1]?.fields.Front).toContain("left:50%");
  });

  it("skips invalid or empty occlusion fronts", () => {
    expect(
      cardToAnkiNotes({
        type: "occlusion",
        front: { image_key: "fig-1", mode: "hide_one", regions: [] },
        back: "",
      }),
    ).toEqual({ skip: true, reason: "occlusion-no-regions" });
    expect(
      cardToAnkiNotes({
        type: "occlusion",
        front: { regions: [{ id: "r1", x: 0, y: 0, w: 1, h: 1, label: "A" }] },
        back: "A",
      }),
    ).toEqual({ skip: true, reason: "occlusion-invalid-front" });
  });

  it("maps image_label and diagram to basic text fields", () => {
    expect(
      cardToAnkiNotes({
        type: "image_label",
        front: "Label structure A",
        back: "Aorta",
      }),
    ).toEqual([
      {
        model: "basic",
        fields: { Front: "Label structure A", Back: "Aorta" },
      },
    ]);
    expect(
      cardToAnkiNotes({
        type: "diagram",
        front: "Which vessel?",
        back: "Pulmonary artery",
      }),
    ).toEqual([
      {
        model: "basic",
        fields: { Front: "Which vessel?", Back: "Pulmonary artery" },
      },
    ]);
  });

  it("uses prompt from object-shaped image_label fronts", () => {
    expect(
      cardToAnkiNotes({
        type: "image_label",
        front: { prompt: "Label the vessel", regions: [] },
        back: "Aorta",
      }),
    ).toEqual([
      {
        model: "basic",
        fields: { Front: "Label the vessel", Back: "Aorta" },
      },
    ]);
  });

  it("skips object fronts without a string prompt", () => {
    expect(
      cardToAnkiNotes({
        type: "diagram",
        front: { regions: [] },
        back: "Aorta",
      }),
    ).toEqual({ skip: true, reason: "non-string-fields" });
  });

  it("converts a single underscore cloze blank using the back", () => {
    expect(
      cardToAnkiNotes({
        type: "cloze",
        front: "The ___ produces ATP",
        back: "mitochondria",
      }),
    ).toEqual([
      {
        model: "cloze",
        fields: {
          Text: "The {{c1::mitochondria}} produces ATP",
          Extra: "mitochondria",
        },
      },
    ]);
  });

  it("skips underscore cloze when the back is empty", () => {
    expect(
      cardToAnkiNotes({
        type: "cloze",
        front: "The ___ produces ATP",
        back: "",
      }),
    ).toEqual({ skip: true, reason: "cloze-underscore-unconvertible" });
  });
});
