import { describe, expect, it } from "vitest";
import {
  NOTES_RENDER_CSS_MAX,
  NOTES_ZOOM_FIT,
  NOTES_ZOOM_MAX,
  NOTES_ZOOM_MIN,
  NOTES_ZOOM_STEP,
  clampNotesZoom,
  notesRenderCssWidth,
  stepNotesZoom,
} from "../../src/study/notesViewerZoom";

describe("clampNotesZoom", () => {
  it("clamps into [min, max]", () => {
    expect(clampNotesZoom(NOTES_ZOOM_MIN - 1)).toBe(NOTES_ZOOM_MIN);
    expect(clampNotesZoom(NOTES_ZOOM_MAX + 1)).toBe(NOTES_ZOOM_MAX);
    expect(clampNotesZoom(1.5)).toBe(1.5);
  });

  it("returns fit for non-finite input", () => {
    expect(clampNotesZoom(Number.NaN)).toBe(NOTES_ZOOM_FIT);
    expect(clampNotesZoom(Number.POSITIVE_INFINITY)).toBe(NOTES_ZOOM_FIT);
  });
});

describe("stepNotesZoom", () => {
  it("steps by NOTES_ZOOM_STEP and clamps", () => {
    expect(stepNotesZoom(1, 1)).toBe(1 + NOTES_ZOOM_STEP);
    expect(stepNotesZoom(1, -1)).toBe(1 - NOTES_ZOOM_STEP);
    expect(stepNotesZoom(NOTES_ZOOM_MAX, 1)).toBe(NOTES_ZOOM_MAX);
    expect(stepNotesZoom(NOTES_ZOOM_MIN, -1)).toBe(NOTES_ZOOM_MIN);
  });
});

describe("notesRenderCssWidth", () => {
  it("returns floor(fitWidth * zoom) when both positive", () => {
    expect(notesRenderCssWidth(400, 1)).toBe(400);
    expect(notesRenderCssWidth(400, 1.5)).toBe(600);
    expect(notesRenderCssWidth(401, 0.5)).toBe(200);
  });

  it("returns at least 1 for valid fit width", () => {
    expect(notesRenderCssWidth(1, NOTES_ZOOM_MIN)).toBe(1);
  });

  it("falls back when fit width is invalid", () => {
    expect(notesRenderCssWidth(0, 2)).toBe(1);
    expect(notesRenderCssWidth(Number.NaN, 2)).toBe(1);
  });

  it("caps CSS width at NOTES_RENDER_CSS_MAX", () => {
    expect(notesRenderCssWidth(1200, NOTES_ZOOM_MAX)).toBe(
      NOTES_RENDER_CSS_MAX,
    );
  });
});
