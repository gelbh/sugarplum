import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { runConsentedPptxSplitUpload } from "../../../src/materials/runConsentedPptxSplitUpload";

async function tinyPptx(slideCount: number): Promise<File> {
  const zip = new JSZip();
  const overrides: string[] = [
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
  ];
  const sldIds: string[] = [];
  const rels: string[] = [];
  for (let n = 1; n <= slideCount; n++) {
    const rId = `rId${n + 1}`;
    const slidePath = `ppt/slides/slide${n}.xml`;
    overrides.push(
      `<Override PartName="/${slidePath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
    sldIds.push(`<p:sldId id="${255 + n}" r:id="${rId}"/>`);
    rels.push(
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
    );
    zip.file(slidePath, `<p:sld><a:t>S${n}</a:t></p:sld>`);
  }
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${overrides.join("")}</Types>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIds.join("")}</p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
  );
  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buf], "deck.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

describe("runConsentedPptxSplitUpload", () => {
  it("uploads all parts and reports progress", async () => {
    const file = await tinyPptx(2);
    const progress: string[] = [];
    const uploadPart = vi.fn(async () => ({
      jobId: "job-1",
      status: "queued",
    }));
    const result = await runConsentedPptxSplitUpload({
      file,
      maxBytes: 50 * 1024 * 1024,
      onProgress: (label) => progress.push(label),
      uploadPart,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(uploadPart).toHaveBeenCalledTimes(1);
    expect(progress[0]).toMatch(/Splitting PPTX/);
    expect(progress.some((p) => /Uploading 1 of/.test(p))).toBe(true);
    expect(result.lastJobId).toBe("job-1");
  });

  it("surfaces mid-batch failure with already-stored note", async () => {
    const chunk = 4_000;
    const zip = new JSZip();
    const overrides: string[] = [
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    ];
    const sldIds: string[] = [];
    const rels: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const rId = `rId${n + 1}`;
      overrides.push(
        `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      );
      overrides.push(
        `<Override PartName="/ppt/media/image${n}.bin" ContentType="application/octet-stream"/>`,
      );
      sldIds.push(`<p:sldId id="${255 + n}" r:id="${rId}"/>`);
      rels.push(
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
      );
      zip.file(`ppt/slides/slide${n}.xml`, `<p:sld/>`);
      zip.file(
        `ppt/slides/_rels/slide${n}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.bin"/></Relationships>`,
      );
      zip.file(`ppt/media/image${n}.bin`, new Uint8Array(chunk).fill(n));
    }
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${overrides.join("")}</Types>`,
    );
    zip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIds.join("")}</p:sldIdLst></p:presentation>`,
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([buf], "big.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    // Force multi-part by measuring one-slide size.
    const oneZip = new JSZip();
    oneZip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/media/image1.bin" ContentType="application/octet-stream"/></Types>`,
    );
    oneZip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`,
    );
    oneZip.file(
      "ppt/_rels/presentation.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
    );
    oneZip.file("ppt/slides/slide1.xml", `<p:sld/>`);
    oneZip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.bin"/></Relationships>`,
    );
    oneZip.file("ppt/media/image1.bin", new Uint8Array(chunk).fill(1));
    const oneBuf = await oneZip.generateAsync({ type: "arraybuffer" });
    const oneFile = new File([oneBuf], "one.pptx");
    const { splitPptxUnderLimit } = await import(
      "../../../src/materials/splitPptxUnderLimit"
    );
    const oneSplit = await splitPptxUnderLimit(oneFile, 50 * 1024 * 1024);
    expect(oneSplit.ok).toBe(true);
    if (!oneSplit.ok) return;
    const maxBytes = oneSplit.files[0]!.size + 512;

    let calls = 0;
    const result = await runConsentedPptxSplitUpload({
      file,
      maxBytes,
      onProgress: () => {},
      uploadPart: async () => {
        calls += 1;
        if (calls === 2) throw new Error("network down");
        return { jobId: `job-${calls}`, status: "queued" };
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.next).toBe("error");
    expect(result.message).toMatch(/Failed on part 2 of/);
    expect(result.message).toMatch(/already stored/);
  });

  it("never routes slide_too_large to compress", async () => {
    const file = await tinyPptx(1);
    const result = await runConsentedPptxSplitUpload({
      file,
      maxBytes: 50,
      onProgress: () => {},
      uploadPart: async () => ({ jobId: null, status: "x" }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.next).toBe("error");
    expect(result.reason).toBe("slide_too_large");
  });
});
