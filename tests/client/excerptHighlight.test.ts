import { describe, expect, it } from "vitest";
import {
  excerptHighlightRects,
  type TextRun,
} from "../../src/study/excerptHighlight";

const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

function run(
  str: string,
  x: number,
  y: number,
  width: number,
  height: number,
): TextRun {
  return { str, width, height, transform: [1, 0, 0, 1, x, y] };
}

describe("excerptHighlightRects", () => {
  it("returns the run rect when the excerpt sits inside one item", () => {
    expect(
      excerptHighlightRects(
        [run("Hello world", 10, 20, 50, 10)],
        "world",
        IDENTITY,
      ),
    ).toEqual([{ x: 10, y: 20, w: 50, h: 10 }]);
  });

  it("returns nothing when the excerpt is absent", () => {
    expect(
      excerptHighlightRects(
        [run("Hello world", 10, 20, 50, 10)],
        "nope",
        IDENTITY,
      ),
    ).toEqual([]);
  });

  it("returns each run the excerpt spans, in order", () => {
    expect(
      excerptHighlightRects(
        [run("Hello ", 0, 0, 20, 8), run("world", 20, 0, 24, 8)],
        "Hello world",
        IDENTITY,
      ),
    ).toEqual([
      { x: 0, y: 0, w: 20, h: 8 },
      { x: 20, y: 0, w: 24, h: 8 },
    ]);
  });
});
