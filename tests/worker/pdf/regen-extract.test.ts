import { describe, expect, it } from "vitest";
import { extractPdfText } from "../../../worker/materials/extract-pdf";
import { minimalPdfWithText } from "../pdf-fixture";

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** One font, N empty pages. Enough for unpdf to report numPages. */
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

describe("extractPdfText regen cap", () => {
  it("returns text from a short pdf", async () => {
    const text = await extractPdfText(asBuffer(minimalPdfWithText("Cecum")));
    expect(text).toContain("Cecum");
  });

  it("throws when the page count is above the regen cap", async () => {
    await expect(extractPdfText(pdfWithPages(51))).rejects.toThrow(/51 pages/);
  });
});
