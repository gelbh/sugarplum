import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { splitPptxUnderLimit } from "../../src/materials/splitPptxUnderLimit";

type SlideSpec = {
  /** Opaque media bytes embedded and referenced by this slide only. */
  mediaBytes?: number;
  /** Shared media key reused across slides (same path). */
  sharedMediaKey?: string;
  sharedMediaBytes?: number;
};

async function buildPptx(slides: SlideSpec[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const overrides: string[] = [
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
  ];
  const sldIds: string[] = [];
  const rels: string[] = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>`,
  ];
  const sharedWritten = new Set<string>();

  for (let i = 0; i < slides.length; i++) {
    const n = i + 1;
    const rId = `rId${n + 1}`;
    const slidePath = `ppt/slides/slide${n}.xml`;
    const slideRelsPath = `ppt/slides/_rels/slide${n}.xml.rels`;
    overrides.push(
      `<Override PartName="/${slidePath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
    sldIds.push(`<p:sldId id="${255 + n}" r:id="${rId}"/>`);
    rels.push(
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
    );

    const slideRels: string[] = [];
    let slideBody = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><a:t>Slide ${n}</a:t></p:spTree></p:cSld></p:sld>`;

    const spec = slides[i]!;
    if (spec.mediaBytes && spec.mediaBytes > 0) {
      const mediaPath = `ppt/media/image${n}.bin`;
      zip.file(mediaPath, new Uint8Array(spec.mediaBytes).fill(n & 0xff));
      overrides.push(
        `<Override PartName="/${mediaPath}" ContentType="application/octet-stream"/>`,
      );
      slideRels.push(
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.bin"/>`,
      );
      slideBody = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`;
    }
    if (spec.sharedMediaKey && spec.sharedMediaBytes) {
      const mediaPath = `ppt/media/${spec.sharedMediaKey}`;
      if (!sharedWritten.has(mediaPath)) {
        zip.file(mediaPath, new Uint8Array(spec.sharedMediaBytes).fill(0xab));
        overrides.push(
          `<Override PartName="/${mediaPath}" ContentType="application/octet-stream"/>`,
        );
        sharedWritten.add(mediaPath);
      }
      const rid = `rIdShared`;
      slideRels.push(
        `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${spec.sharedMediaKey}"/>`,
      );
    }

    zip.file(slidePath, slideBody);
    if (slideRels.length > 0) {
      zip.file(
        slideRelsPath,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels.join("")}</Relationships>`,
      );
    }
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
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  );

  return zip.generateAsync({ type: "arraybuffer" });
}

async function slideCountInPart(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  return Object.keys(zip.files).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(n),
  ).length;
}

describe("splitPptxUnderLimit", () => {
  it("returns empty error for 0-slide pptx", async () => {
    const buf = await buildPptx([]);
    const result = await splitPptxUnderLimit(buf, 50 * 1024 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("returns invalid_pptx for garbage bytes", async () => {
    const garbage = new TextEncoder().encode("not-a-zip").buffer;
    const result = await splitPptxUnderLimit(garbage, 50 * 1024 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_pptx");
  });

  it("returns one file when under limit", async () => {
    const buf = await buildPptx([{}, {}]);
    const result = await splitPptxUnderLimit(buf, 50 * 1024 * 1024, {
      nameStem: "lecture",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toHaveLength(1);
      expect(result.files[0]!.name).toBe("lecture (1/1).pptx");
      expect(await slideCountInPart(result.files[0]!)).toBe(2);
    }
  });

  it("splits when maxBytes forces multiple parts", async () => {
    const chunk = 8_000;
    const buf = await buildPptx([
      { mediaBytes: chunk },
      { mediaBytes: chunk },
      { mediaBytes: chunk },
      { mediaBytes: chunk },
    ]);
    const oneSlide = await buildPptx([{ mediaBytes: chunk }]);
    const single = await splitPptxUnderLimit(oneSlide, 50 * 1024 * 1024);
    expect(single.ok).toBe(true);
    if (!single.ok) return;
    // Cap just above a one-slide package so packaging overhead from a larger
    // source still packs one slide per part.
    const maxBytes = single.files[0]!.size + 512;
    const result = await splitPptxUnderLimit(buf, maxBytes, {
      nameStem: "lecture",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.length).toBeGreaterThan(1);
      for (const [i, f] of result.files.entries()) {
        expect(f.size).toBeLessThanOrEqual(maxBytes);
        expect(f.name).toBe(`lecture (${i + 1}/${result.files.length}).pptx`);
        expect(f.type).toContain("presentationml");
      }
      const totalSlides = (
        await Promise.all(result.files.map((f) => slideCountInPart(f)))
      ).reduce((a, b) => a + b, 0);
      expect(totalSlides).toBe(4);
    }
  });

  it("returns slide_too_large when one slide cannot fit", async () => {
    const buf = await buildPptx([{ mediaBytes: 4_000 }]);
    const result = await splitPptxUnderLimit(buf, 100, { nameStem: "scan" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("slide_too_large");
      if (result.reason === "slide_too_large") {
        expect(result.slideCount).toBe(1);
      }
    }
  });

  it("drops media only referenced by removed slides", async () => {
    const chunk = 6_000;
    const buf = await buildPptx([{ mediaBytes: chunk }, { mediaBytes: chunk }]);
    const single = await splitPptxUnderLimit(
      await buildPptx([{ mediaBytes: chunk }]),
      50 * 1024 * 1024,
    );
    expect(single.ok).toBe(true);
    if (!single.ok) return;
    const maxBytes = single.files[0]!.size + 512;
    const result = await splitPptxUnderLimit(buf, maxBytes, {
      nameStem: "deck",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.length).toBe(2);
    for (const part of result.files) {
      const zip = await JSZip.loadAsync(await part.arrayBuffer());
      const media = Object.keys(zip.files).filter(
        (n) => n.startsWith("ppt/media/") && !zip.files[n]!.dir,
      );
      expect(media).toHaveLength(1);
      expect(await slideCountInPart(part)).toBe(1);
    }
  });

  it("keeps shared media referenced by a kept slide", async () => {
    const shared = 5_000;
    const buf = await buildPptx([
      { sharedMediaKey: "shared.bin", sharedMediaBytes: shared },
      { sharedMediaKey: "shared.bin", sharedMediaBytes: shared },
    ]);
    const result = await splitPptxUnderLimit(buf, 50 * 1024 * 1024, {
      nameStem: "shared",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const zip = await JSZip.loadAsync(await result.files[0]!.arrayBuffer());
    expect(zip.file("ppt/media/shared.bin")).toBeTruthy();
  });
});
