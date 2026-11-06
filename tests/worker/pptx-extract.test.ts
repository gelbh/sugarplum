import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  extractPptxSlides,
  extractPptxText,
} from "../../worker/materials/extract-pptx";

async function minimalPptx(slideXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
  );
  zip.file("ppt/slides/slide1.xml", slideXml);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("extractPptxText", () => {
  it("extracts a:t text from slides", async () => {
    const buf = await minimalPptx(
      `<p:sld><p:cSld><p:spTree><a:t>Hello</a:t><a:t>World</a:t></p:spTree></p:cSld></p:sld>`,
    );
    const text = await extractPptxText(buf);
    expect(text).toContain("Hello");
    expect(text).toContain("World");
  });

  it("stops at the char cap and continues from a later slide", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld><a:t>${"A".repeat(30)}</a:t></p:sld>`,
    );
    zip.file(
      "ppt/slides/slide2.xml",
      `<p:sld><a:t>${"B".repeat(30)}</a:t></p:sld>`,
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const first = await extractPptxSlides(buf, { maxChars: 10 });
    expect(first.pages.map((slide) => slide.page)).toEqual([1]);
    expect(first.pageEnd).toBe(1);
    const second = await extractPptxSlides(buf, {
      startSlide: first.pageEnd + 1,
      maxChars: 10,
    });
    expect(second.pages.map((slide) => slide.page)).toEqual([2]);
    expect(second.pages[0]?.text).toContain("B");
  });

  it("throws when the deck is longer than the regen char cap", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld><a:t>${"A".repeat(200_001)}</a:t></p:sld>`,
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    await expect(extractPptxText(buf)).rejects.toThrow(/exceeds/i);
  });

  it("throws when slides have no text", async () => {
    const buf = await minimalPptx(`<p:sld><p:cSld></p:cSld></p:sld>`);
    await expect(extractPptxText(buf)).rejects.toThrow(/no text/i);
  });
});
