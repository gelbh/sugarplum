import { describe, expect, it } from "vitest";
import { PPTX_MIME } from "../../src/api/client";
import {
  formatUploadBytes,
  isAllowedUploadFile,
  uploadKindLabel,
  UPLOAD_ACCEPT,
} from "../../src/deckHub/addMaterialUploadHelpers";

function fakeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("addMaterialUploadHelpers", () => {
  it("exposes upload accept string with pdf pptx and images", () => {
    expect(UPLOAD_ACCEPT).toContain("application/pdf");
    expect(UPLOAD_ACCEPT).toContain(".pptx");
    expect(UPLOAD_ACCEPT).toContain("image/webp");
  });

  it("allows pdf pptx and image mime types", () => {
    expect(isAllowedUploadFile(fakeFile("notes.pdf", "application/pdf"))).toBe(
      true,
    );
    expect(isAllowedUploadFile(fakeFile("deck.pptx", PPTX_MIME))).toBe(true);
    expect(isAllowedUploadFile(fakeFile("fig.png", "image/png"))).toBe(true);
    expect(isAllowedUploadFile(fakeFile("fig.jpg", "image/jpeg"))).toBe(true);
    expect(isAllowedUploadFile(fakeFile("fig.webp", "image/webp"))).toBe(true);
  });

  it("rejects disallowed mime types", () => {
    expect(isAllowedUploadFile(fakeFile("notes.docx", "application/msword"))).toBe(
      false,
    );
    expect(isAllowedUploadFile(fakeFile("clip.gif", "image/gif"))).toBe(false);
  });

  it("allows zip-mime pptx via resolveUploadContentType", () => {
    expect(
      isAllowedUploadFile(fakeFile("deck.pptx", "application/zip")),
    ).toBe(true);
  });

  it("labels upload kinds", () => {
    expect(uploadKindLabel(fakeFile("notes.pdf", "application/pdf"))).toBe(
      "PDF",
    );
    expect(uploadKindLabel(fakeFile("deck.pptx", PPTX_MIME))).toBe("PPTX");
    expect(uploadKindLabel(fakeFile("fig.png", "image/png"))).toBe("Image");
    expect(uploadKindLabel(fakeFile("notes.docx", "application/msword"))).toBe(
      "File",
    );
  });

  it("formats byte sizes as KB or MB", () => {
    expect(formatUploadBytes(500)).toBe("1 KB");
    expect(formatUploadBytes(2048)).toBe("2 KB");
    expect(formatUploadBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatUploadBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
