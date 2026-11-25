import { describe, expect, it } from "vitest";
import { extractPdfPageNumbers } from "../../../../worker/materials/extract-pdf";
import {
  applyOcrSidecar,
  mergeOcrPages,
  nextUnstudiedPages,
  orphanedSidecarPages,
  parseOcrPages,
  parseStoredOcrPages,
  pdfTextOrOcrSidecar,
} from "../../../../worker/materials/ocr-sidecar";
import { minimalPdfWithText } from "../../pdf-fixture";

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** One font, N pages. Enough for unpdf to report numPages. */
function pdfWithPages(count: number): ArrayBuffer {
  const stream = "BT /F1 12 Tf 50 100 Td (P) Tj ET";
  const objects: string[] = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "",
    "3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  const kids: string[] = [];
  for (let i = 0; i < count; i++) {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(
      `${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contentId} 0 R /Resources<< /Font<< /F1 3 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${contentId} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    );
  }
  objects[1] =
    `2 0 obj<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${count} >>endobj\n`;
  let body = "%PDF-1.1\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return asBuffer(new TextEncoder().encode(body + xref + trailer));
}

describe("mergeOcrPages", () => {
  it("keeps the stored page, appends a new one, and rejects a page outside the window", () => {
    expect(
      mergeOcrPages(
        [{ page: 1, text: "first" }],
        [{ page: 1, text: "overwrite" }, { page: 9, text: "later" }],
        { start: 1, end: 2000 },
      ),
    ).toEqual([
      { page: 1, text: "first" },
      { page: 9, text: "later" },
    ]);
    expect(
      mergeOcrPages([], [{ page: 121, text: "past cursor" }], {
        start: 1,
        end: 2000,
      }),
    ).toEqual([{ page: 121, text: "past cursor" }]);
    expect(() =>
      mergeOcrPages([], [{ page: 2001, text: "no" }], {
        start: 1,
        end: 2000,
      }),
    ).toThrow(/Invalid ocrPages/);
  });
});

describe("parseStoredOcrPages", () => {
  it("accepts a ninth stored page and page 150", () => {
    const pages = parseStoredOcrPages(
      Array.from({ length: 9 }, (_, index) => ({
        page: index + 1,
        text: "scan",
      })),
    );
    expect(pages).toHaveLength(9);
    expect(parseStoredOcrPages([{ page: 150, text: "far" }])).toEqual([
      { page: 150, text: "far" },
    ]);
  });
});

describe("parseOcrPages page ceiling", () => {
  it("rejects page 2001", () => {
    expect(() => parseOcrPages([{ page: 2001, text: "x" }])).toThrow(
      /Invalid ocrPages/,
    );
  });
});

describe("parseOcrPages duplicates", () => {
  it("rejects the same page twice in one body", () => {
    expect(() =>
      parseOcrPages([
        { page: 1, text: "a" },
        { page: 1, text: "b" },
      ]),
    ).toThrow(/Invalid ocrPages/);
  });
});

describe("parseOcrPages", () => {
  it("rejects a ninth page, page 0, and an over-long string", () => {
    expect(() =>
      parseOcrPages(
        Array.from({ length: 9 }, (_, index) => ({
          page: index + 1,
          text: "scan",
        })),
      ),
    ).toThrow(/Invalid ocrPages/);
    expect(() => parseOcrPages([{ page: 0, text: "scan" }])).toThrow(
      /Invalid ocrPages/,
    );
    expect(() =>
      parseOcrPages([{ page: 1, text: "a".repeat(8_001) }]),
    ).toThrow(/Invalid ocrPages/);
  });
});

describe("applyOcrSidecar", () => {
  it("fills only empty pages", () => {
    const pages = applyOcrSidecar(
      [
        { page: 1, text: "native" },
        { page: 2, text: "  " },
      ],
      { pages: [{ page: 1, text: "ocr one" }, { page: 2, text: "ocr two" }] },
    );
    expect(pages).toEqual([
      { page: 1, text: "native" },
      { page: 2, text: "ocr two" },
    ]);
  });
});

describe("orphanedSidecarPages", () => {
  it("includes blank sidecar pages behind next_page that were not picked", () => {
    expect(
      orphanedSidecarPages({
        pages: [
          { page: 9, textLayer: "", sidecarText: "later" },
          { page: 10, textLayer: "native", sidecarText: "ignored" },
          { page: 11, textLayer: "  ", sidecarText: "picked" },
          { page: 12, textLayer: "", sidecarText: "ahead" },
          { page: 8, textLayer: "", sidecarText: "  " },
        ],
        pickedPages: [11],
        nextPage: 12,
      }),
    ).toEqual([9]);
  });
});

describe("nextUnstudiedPages", () => {
  it("drops picked pages and adds orphans", () => {
    expect(
      nextUnstudiedPages({
        previous: [9, 10],
        pickedPages: [9],
        orphanPages: [15],
      }),
    ).toEqual([10, 15]);
  });
});

describe("extractPdfPageNumbers", () => {
  it("returns existing pages and skips pages past the document", async () => {
    const bytes = asBuffer(minimalPdfWithText("Cecum"));
    const found = await extractPdfPageNumbers(bytes, [1]);
    expect(found).toHaveLength(1);
    expect(found[0]?.page).toBe(1);
    expect(found[0]?.text).toContain("Cecum");
    expect(await extractPdfPageNumbers(bytes, [99])).toEqual([]);
  });
});

describe("pdfTextOrOcrSidecar", () => {
  it("uses sidecar text when extraction finds no text", async () => {
    const text = await pdfTextOrOcrSidecar(
      asBuffer(minimalPdfWithText("")),
      async () => ({ pages: [{ page: 1, text: "Cecum of the chicken" }] }),
    );
    expect(text).toBe("Cecum of the chicken");
  });

  it("rethrows the no-text error when the sidecar is empty", async () => {
    await expect(
      pdfTextOrOcrSidecar(asBuffer(minimalPdfWithText("")), async () => null),
    ).rejects.toThrow(/PDF text extraction returned no text/);
  });

  it("still throws the page cap without reading the sidecar", async () => {
    let reads = 0;
    await expect(
      pdfTextOrOcrSidecar(pdfWithPages(51), async () => {
        reads += 1;
        return { pages: [{ page: 1, text: "should not be used" }] };
      }),
    ).rejects.toThrow(/51 pages/);
    expect(reads).toBe(0);
  });

  it("refuses a sidecar longer than the regen character cap", async () => {
    await expect(
      pdfTextOrOcrSidecar(asBuffer(minimalPdfWithText("")), async () => ({
        pages: [{ page: 1, text: "a".repeat(200_001) }],
      })),
    ).rejects.toThrow(/PDF text exceeds 200000 characters/);
  });
});
