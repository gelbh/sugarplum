import { PDFDocument } from "pdf-lib";

export type SplitPdfOk = { ok: true; files: File[] };
export type SplitPdfErr = {
  ok: false;
  reason: "invalid_pdf" | "page_too_large" | "empty";
  message: string;
};

function resolveStem(
  source: File | ArrayBuffer,
  opts?: { nameStem?: string },
): string {
  if (opts?.nameStem) return opts.nameStem;
  if (source instanceof File) {
    return source.name.replace(/\.pdf$/i, "") || "document";
  }
  return "document";
}

async function toBytes(source: File | ArrayBuffer): Promise<ArrayBuffer> {
  if (source instanceof File) return source.arrayBuffer();
  return source;
}

async function savePageRange(
  sourceDoc: PDFDocument,
  start: number,
  endExclusive: number,
): Promise<Uint8Array> {
  const part = await PDFDocument.create();
  const indices = Array.from(
    { length: endExclusive - start },
    (_, i) => start + i,
  );
  const pages = await part.copyPages(sourceDoc, indices);
  for (const page of pages) part.addPage(page);
  return part.save();
}

export async function splitPdfUnderLimit(
  source: File | ArrayBuffer,
  maxBytes: number,
  opts?: { nameStem?: string },
): Promise<SplitPdfOk | SplitPdfErr> {
  let sourceDoc: PDFDocument;
  try {
    sourceDoc = await PDFDocument.load(await toBytes(source));
  } catch {
    return {
      ok: false,
      reason: "invalid_pdf",
      message: "Could not read this PDF",
    };
  }

  const pageCount = sourceDoc.getPageCount();
  if (pageCount === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "This PDF has no pages",
    };
  }

  const ranges: Array<{ start: number; endExclusive: number }> = [];
  let rangeStart = 0;
  let sealedEnd = 0;

  for (let end = 1; end <= pageCount; end++) {
    const candidate = await savePageRange(sourceDoc, rangeStart, end);
    if (candidate.byteLength <= maxBytes) {
      sealedEnd = end;
      continue;
    }

    if (sealedEnd > rangeStart) {
      ranges.push({ start: rangeStart, endExclusive: sealedEnd });
      rangeStart = sealedEnd;
      sealedEnd = rangeStart;
      end = rangeStart;
      continue;
    }

    return {
      ok: false,
      reason: "page_too_large",
      message:
        "A single page is larger than the upload limit. Compress the PDF externally and try again.",
    };
  }

  if (sealedEnd > rangeStart) {
    ranges.push({ start: rangeStart, endExclusive: sealedEnd });
  }

  const stem = resolveStem(source, opts);
  const partBytes: Uint8Array[] = [];
  for (const range of ranges) {
    partBytes.push(
      await savePageRange(sourceDoc, range.start, range.endExclusive),
    );
  }

  const n = partBytes.length;
  const files = partBytes.map((bytes, i) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new File([copy], `${stem} (${i + 1}/${n}).pdf`, {
      type: "application/pdf",
    });
  });

  return { ok: true, files };
}
