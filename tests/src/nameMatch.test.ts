import { describe, expect, it } from "vitest";
import { entryNameForms, textMentionsEntry } from "../../src/atlas/hub/nameMatch";

describe("nameMatch separator normalization", () => {
  it("matches hyphenated and underscored forms against spaced haystacks", () => {
    const forms = entryNameForms({
      canonicalName: "Fasciola hepatica",
      commonName: null,
      aliases: ["fasciola-hepatica", "Fasciola_hepatica"],
    });
    expect(textMentionsEntry("see fasciola hepatica today", forms)).toBe(true);
    expect(textMentionsEntry("notes_on_fasciola_hepatica.pdf", forms)).toBe(
      true,
    );
    expect(textMentionsEntry("week-fasciola-hepatica-lab", forms)).toBe(true);
  });
});
