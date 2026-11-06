import { describe, expect, it } from "vitest";
import { studyNotesHighlightRects } from "../../src/components/StudyNotesDialog";

describe("studyNotesHighlightRects", () => {
  it("places a PDF.js text item wash on the glyphs", () => {
    expect(
      studyNotesHighlightRects(
        [
          {
            str: "Hello",
            width: 40,
            height: 12,
            transform: [12, 0, 0, 12, 10, 80],
          },
        ],
        "Hello",
        [1, 0, 0, -1, 0, 100],
      ),
    ).toEqual([{ x: 10, y: 8, w: 40, h: 12 }]);
  });
});
