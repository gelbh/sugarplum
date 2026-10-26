import { describe, expect, it } from "vitest";
import {
  PPTX_MIME,
  resolveUploadContentType,
} from "../../src/api/client";

function fakeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("resolveUploadContentType", () => {
  it("maps zip MIME .pptx to PPTX content type", () => {
    expect(resolveUploadContentType(fakeFile("deck.pptx", "application/zip"))).toBe(
      PPTX_MIME,
    );
    expect(
      resolveUploadContentType(
        fakeFile("deck.pptx", "application/x-zip-compressed"),
      ),
    ).toBe(PPTX_MIME);
  });

  it("maps empty MIME .pptx to PPTX content type", () => {
    expect(resolveUploadContentType(fakeFile("deck.pptx", ""))).toBe(PPTX_MIME);
  });

  it("keeps real PPTX MIME", () => {
    expect(resolveUploadContentType(fakeFile("deck.pptx", PPTX_MIME))).toBe(
      PPTX_MIME,
    );
  });

  it("keeps image MIME when present", () => {
    expect(resolveUploadContentType(fakeFile("fig.png", "image/png"))).toBe(
      "image/png",
    );
  });
});
