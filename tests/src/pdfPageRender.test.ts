import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  assertWithinImageByteLimit,
  cssRectToSourceRect,
} from "../../src/lib/pdfPageRender";

describe("cssRectToSourceRect", () => {
  it("maps CSS rect through canvasSourceScale factor", () => {
    expect(cssRectToSourceRect({ x: 10, y: 20, w: 100, h: 50 }, 2)).toEqual({
      sx: 20,
      sy: 40,
      sw: 200,
      sh: 100,
    });
    expect(cssRectToSourceRect({ x: 0, y: 0, w: 800, h: 600 }, 1)).toEqual({
      sx: 0,
      sy: 0,
      sw: 800,
      sh: 600,
    });
    expect(cssRectToSourceRect({ x: 5, y: 8, w: 40, h: 30 }, 1.5)).toEqual({
      sx: 7.5,
      sy: 12,
      sw: 60,
      sh: 45,
    });
  });
});

describe("assertWithinImageByteLimit", () => {
  it("allows sizes at or under 8MB", () => {
    expect(() => assertWithinImageByteLimit(0)).not.toThrow();
    expect(() => assertWithinImageByteLimit(MAX_IMAGE_BYTES)).not.toThrow();
  });

  it("rejects sizes over 8MB", () => {
    expect(() => assertWithinImageByteLimit(MAX_IMAGE_BYTES + 1)).toThrow(
      /8MB/,
    );
  });
});
