import { describe, expect, it } from "vitest";
import {
  excerptHighlightRects,
  type TextRun,
} from "../../src/study/notes/excerptHighlight";

const IDENTITY = [1, 0, 0, 1, 0, 0] as const;
const Y_DOWN = [1, 0, 0, -1, 0, 100] as const;

function run(
  str: string,
  x: number,
  baselineY: number,
  width: number,
  fontSize: number,
): TextRun {
  return {
    str,
    width,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, x, baselineY],
  };
}

describe("excerptHighlightRects", () => {
  it("returns the glyph box when the excerpt sits inside one item", () => {
    expect(
      excerptHighlightRects(
        [run("Hello world", 10, 30, 50, 10)],
        "world",
        IDENTITY,
      ),
    ).toEqual([{ x: 10, y: 20, w: 50, h: 10 }]);
  });

  it("returns nothing when the excerpt is absent", () => {
    expect(
      excerptHighlightRects(
        [run("Hello world", 10, 30, 50, 10)],
        "nope",
        IDENTITY,
      ),
    ).toEqual([]);
  });

  it("returns each run the excerpt spans, in order", () => {
    expect(
      excerptHighlightRects(
        [run("Hello ", 0, 8, 20, 8), run("world", 20, 8, 24, 8)],
        "Hello world",
        IDENTITY,
      ),
    ).toEqual([
      { x: 0, y: 0, w: 20, h: 8 },
      { x: 20, y: 0, w: 24, h: 8 },
    ]);
  });

  it("matches across a whitespace-only run and returns both word rects", () => {
    expect(
      excerptHighlightRects(
        [
          run("Hello", 0, 8, 20, 8),
          run(" ", 20, 8, 4, 8),
          run("world", 24, 8, 24, 8),
        ],
        "Hello world",
        IDENTITY,
      ),
    ).toEqual([
      { x: 0, y: 0, w: 20, h: 8 },
      { x: 24, y: 0, w: 24, h: 8 },
    ]);
  });

  it("places a PDF.js text item wash on the glyphs", () => {
    expect(
      excerptHighlightRects(
        [
          {
            str: "Hello",
            width: 40,
            height: 12,
            transform: [12, 0, 0, 12, 10, 80],
          },
        ],
        "Hello",
        Y_DOWN,
      ),
    ).toEqual([{ x: 10, y: 8, w: 40, h: 12 }]);
  });
});
