import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { splitPdfUnderLimit } from "../../src/materials/splitPdfUnderLimit";

async function pdfWithPages(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return doc.save();
}

describe("splitPdfUnderLimit", () => {
  it("returns empty error for 0-page pdf", async () => {
    // pdf-lib save() injects a page into empty docs; use a handcrafted 0-page PDF.
    const emptyPdf = new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [] /Count 0 >>
endobj
xref
0 3
0000000000 65535 f 
0000000009 00000 n 
0000000068 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
149
%%EOF`);
    const result = await splitPdfUnderLimit(
      emptyPdf.buffer.slice(
        emptyPdf.byteOffset,
        emptyPdf.byteOffset + emptyPdf.byteLength,
      ),
      50 * 1024 * 1024,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("returns one file when under limit", async () => {
    const bytes = await pdfWithPages(2);
    const result = await splitPdfUnderLimit(bytes.buffer, 50 * 1024 * 1024, {
      nameStem: "lecture",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe("lecture (1/1).pdf");
      expect(result.files[0].size).toBeLessThanOrEqual(50 * 1024 * 1024);
    }
  });

  it("splits when maxBytes forces multiple parts", async () => {
    const one = await pdfWithPages(1);
    const oneSize = one.byteLength;
    const four = await pdfWithPages(4);
    const result = await splitPdfUnderLimit(four.buffer, oneSize, {
      nameStem: "lecture",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.length).toBeGreaterThan(1);
      for (const [i, f] of result.files.entries()) {
        expect(f.size).toBeLessThanOrEqual(oneSize);
        expect(f.name).toBe(`lecture (${i + 1}/${result.files.length}).pdf`);
      }
    }
  });

  it("returns page_too_large when one page cannot fit", async () => {
    const bytes = await pdfWithPages(1);
    const result = await splitPdfUnderLimit(bytes.buffer, 1, {
      nameStem: "scan",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("page_too_large");
      expect(result.pageCount).toBe(1);
    }
  });

  it("includes pageCount on page_too_large for multi-page PDFs", async () => {
    const bytes = await pdfWithPages(3);
    const result = await splitPdfUnderLimit(bytes.buffer, 1, {
      nameStem: "deck",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("page_too_large");
      expect(result.pageCount).toBe(3);
    }
  });
});
