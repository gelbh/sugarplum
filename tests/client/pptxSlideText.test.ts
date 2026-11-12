import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractPptxSlides } from "../../src/study/pptxSlideText";

async function minimalPptx(slideXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
  );
  zip.file("ppt/slides/slide1.xml", slideXml);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("extractPptxSlides (client)", () => {
  it("extracts a:t text from slides", async () => {
    const buf = await minimalPptx(
      `<p:sld><p:cSld><p:spTree><a:t>Hello</a:t><a:t>World</a:t></p:spTree></p:cSld></p:sld>`,
    );
    const extracted = await extractPptxSlides(buf);
    expect(extracted.totalPages).toBe(1);
    expect(extracted.pages[0]?.text).toContain("Hello");
    expect(extracted.pages[0]?.text).toContain("World");
  });

  it("reads multiple slides in order", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
    );
    zip.file("ppt/slides/slide1.xml", `<p:sld><a:t>First</a:t></p:sld>`);
    zip.file("ppt/slides/slide2.xml", `<p:sld><a:t>Second</a:t></p:sld>`);
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const extracted = await extractPptxSlides(buf);
    expect(extracted.pages.map((s) => s.page)).toEqual([1, 2]);
    expect(extracted.pages[1]?.text).toContain("Second");
  });

  it("returns empty pages for a deck with no slides", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const extracted = await extractPptxSlides(buf);
    expect(extracted.totalPages).toBe(0);
    expect(extracted.pages).toEqual([]);
  });
});
