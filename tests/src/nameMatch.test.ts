import { describe, expect, it } from "vitest";
import {
  ALIAS_MAX_CHARS,
  ALIAS_MAX_ITEMS,
  cleanAliasList,
  entryNameForms,
  textMentionsEntry,
} from "../../src/atlas/hub/nameMatch";

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

describe("cleanAliasList", () => {
  it("trims, drops empties and dedupes by searchable form", () => {
    expect(
      cleanAliasList([
        "  follicular mite ",
        "",
        "   ",
        "Follicular  Mite",
        "ear mite",
      ]),
    ).toEqual(["follicular mite", "ear mite"]);
  });

  it("does not truncate; limits are the caller's job", () => {
    const many = Array.from({ length: ALIAS_MAX_ITEMS + 1 }, (_, i) => `a${i}`);
    expect(cleanAliasList(many)).toHaveLength(ALIAS_MAX_ITEMS + 1);
    expect(ALIAS_MAX_CHARS).toBe(80);
  });
});
