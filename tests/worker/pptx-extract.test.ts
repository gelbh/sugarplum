import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractPptxText } from "../../worker/materials/extract-pptx";

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

  it("throws when slides have no text", async () => {
    const buf = await minimalPptx(`<p:sld><p:cSld></p:cSld></p:sld>`);
    await expect(extractPptxText(buf)).rejects.toThrow(/no text/i);
  });
});
