import { describe, it, expect } from "vitest";
import { cardToAnkiNote } from "../../worker/export/notes";

describe("cardToAnkiNote", () => {
  it("maps qa to basic Front and Back", () => {
    const note = cardToAnkiNote({
      type: "qa",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
    });
    expect(note).toEqual({
      model: "basic",
      fields: { Front: "What is ATP?", Back: "Adenosine triphosphate" },
    });
  });

  it("maps cloze to cloze Text and Extra", () => {
    const note = cardToAnkiNote({
      type: "cloze",
      front: "{{c1::mitochondria}} produce ATP",
      back: "Powerhouse detail",
    });
    expect(note).toEqual({
      model: "cloze",
      fields: {
        Text: "{{c1::mitochondria}} produce ATP",
        Extra: "Powerhouse detail",
      },
    });
  });

  it("maps mcq to sugarplum_mcq with newline-joined options", () => {
    const note = cardToAnkiNote({
      type: "mcq",
      front: "Pick the organelle",
      back: "Mitochondria",
      options: ["Nucleus", "Mitochondria", "Ribosome"],
    });
    expect(note).toEqual({
      model: "sugarplum_mcq",
      fields: {
        Front: "Pick the organelle",
        Options: "Nucleus\nMitochondria\nRibosome",
        Answer: "Mitochondria",
      },
    });
  });

  it("skips occlusion in Phase 1", () => {
    expect(
      cardToAnkiNote({
        type: "occlusion",
        front: { image_key: "fig-1", regions: [] },
        back: "",
      }),
    ).toEqual({ skip: true, reason: "occlusion-phase3" });
  });

  it("maps image_label and diagram to basic text fields", () => {
    expect(
      cardToAnkiNote({
        type: "image_label",
        front: "Label structure A",
        back: "Aorta",
      }),
    ).toEqual({
      model: "basic",
      fields: { Front: "Label structure A", Back: "Aorta" },
    });
    expect(
      cardToAnkiNote({
        type: "diagram",
        front: "Which vessel?",
        back: "Pulmonary artery",
      }),
    ).toEqual({
      model: "basic",
      fields: { Front: "Which vessel?", Back: "Pulmonary artery" },
    });
  });
});
