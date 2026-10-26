/**
 * PDF text extraction for the generation consumer.
 *
 * Workers path (preferred later): `unpdf` or a pdf.js build that avoids Node `fs`.
 * `pdfjs-dist` is in package.json but its default entry pulls Node APIs; do not
 * import it from the request Worker until a Workers-safe entry is wired.
 *
 * ponytail: stub until Task that consumes materials needs real text; throws so
 * callers fail loudly instead of silently returning empty extract.
 */
export async function extractPdfText(_bytes: ArrayBuffer): Promise<string> {
  throw new Error("not implemented");
}
