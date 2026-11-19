import JSZip from "jszip";
import { formatSplitPartFilename } from "./splitPartFilename";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const SLIDE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const NOTES_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";

export type SplitPptxOk = { ok: true; files: File[] };
export type SplitPptxErr =
  | { ok: false; reason: "invalid_pptx" | "empty"; message: string }
  | {
      ok: false;
      reason: "slide_too_large";
      message: string;
      slideCount: number;
    };

type SlideRef = {
  rId: string;
  target: string;
  sldIdXml: string;
};

function resolveStem(
  source: File | ArrayBuffer,
  opts?: { nameStem?: string },
): string {
  if (opts?.nameStem) return opts.nameStem;
  if (source instanceof File) {
    return source.name.replace(/\.pptx$/i, "") || "presentation";
  }
  return "presentation";
}

async function toBytes(source: File | ArrayBuffer): Promise<ArrayBuffer> {
  if (source instanceof File) return source.arrayBuffer();
  return source;
}

function posixJoin(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\//, "");
  const parts = [...baseDir.split("/").filter(Boolean), ...target.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function parsePresentationRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re =
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>/gi;
  for (const match of relsXml.matchAll(re)) {
    const id = match[1];
    const target = match[2];
    if (id && target) map.set(id, target);
  }
  const re2 =
    /<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"[^>]*\/?>/gi;
  for (const match of relsXml.matchAll(re2)) {
    const target = match[1];
    const id = match[2];
    if (id && target) map.set(id, target);
  }
  return map;
}

function listSlides(
  presentationXml: string,
  relsXml: string,
): SlideRef[] | null {
  const idToTarget = parsePresentationRels(relsXml);
  const slides: SlideRef[] = [];
  const sldIdRe = /<p:sldId\b[^>]*\/>|<p:sldId\b[^>]*>\s*<\/p:sldId>/gi;
  for (const match of presentationXml.matchAll(sldIdRe)) {
    const tag = match[0];
    const rId =
      /\br:id="([^"]+)"/i.exec(tag)?.[1] ?? /\bId="(rId[^"]+)"/i.exec(tag)?.[1];
    if (!rId) return null;
    const target = idToTarget.get(rId);
    if (!target) return null;
    slides.push({ rId, target, sldIdXml: tag });
  }
  return slides;
}

function rewritePresentationXml(
  presentationXml: string,
  keep: SlideRef[],
): string {
  const lstMatch = /<p:sldIdLst\b[^>]*>[\s\S]*?<\/p:sldIdLst>/i.exec(
    presentationXml,
  );
  if (!lstMatch) return presentationXml;
  const block = lstMatch[0];
  const inner = keep.map((s) => s.sldIdXml).join("");
  const open = /<p:sldIdLst\b[^>]*>/i.exec(block)?.[0] ?? "<p:sldIdLst>";
  return presentationXml.replace(block, `${open}${inner}</p:sldIdLst>`);
}

function filterSlideRelationships(
  relsXml: string,
  keepRIds: Set<string>,
): string {
  return relsXml.replace(/<Relationship\b[^>]*\/?>/gi, (tag) => {
    const type = /\bType="([^"]+)"/i.exec(tag)?.[1] ?? "";
    if (type !== SLIDE_REL_TYPE && !type.endsWith("/relationships/slide")) {
      return tag;
    }
    const id = /\bId="([^"]+)"/i.exec(tag)?.[1];
    if (!id) return "";
    return keepRIds.has(id) ? tag : "";
  });
}

function stripContentTypeOverrides(
  contentTypesXml: string,
  dropPartNames: Set<string>,
): string {
  return contentTypesXml.replace(/<Override\b[^>]*\/?>/gi, (tag) => {
    const part = /\bPartName="([^"]+)"/i.exec(tag)?.[1];
    if (!part) return tag;
    const normalized = part.replace(/^\//, "");
    return dropPartNames.has(normalized) ? "" : tag;
  });
}

function partDirFromRels(relsPath: string): string {
  // ppt/_rels/presentation.xml.rels -> ppt
  // ppt/slides/_rels/slide1.xml.rels -> ppt/slides
  const m = /^(.*)\/_rels\/[^/]+$/.exec(relsPath);
  return m?.[1] ?? "";
}

async function collectTargetsFromRels(
  zip: JSZip,
  relsPath: string,
  visited: Set<string>,
): Promise<Set<string>> {
  const refs = new Set<string>();
  if (visited.has(relsPath)) return refs;
  visited.add(relsPath);
  const file = zip.file(relsPath);
  if (!file) return refs;
  const xml = await file.async("string");
  const re = /<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\/?>/gi;
  const base = partDirFromRels(relsPath);
  for (const match of xml.matchAll(re)) {
    const target = match[1];
    if (!target) continue;
    if (/^https?:/i.test(target) || target.startsWith("mailto:")) continue;
    const mode = /\bTargetMode="([^"]+)"/i.exec(match[0])?.[1];
    if (mode && mode.toLowerCase() === "external") continue;
    const abs = posixJoin(base, target);
    refs.add(abs);
    const nestedRels = `${dirname(abs)}/_rels/${abs.split("/").pop()}.rels`;
    if (zip.file(nestedRels)) {
      const nested = await collectTargetsFromRels(zip, nestedRels, visited);
      for (const n of nested) refs.add(n);
    }
  }
  return refs;
}

async function cloneZip(source: JSZip): Promise<JSZip> {
  const out = new JSZip();
  const names = Object.keys(source.files);
  await Promise.all(
    names.map(async (name) => {
      const entry = source.files[name];
      if (!entry || entry.dir) return;
      out.file(name, await entry.async("uint8array"));
    }),
  );
  return out;
}

async function serializeSlideRange(
  source: JSZip,
  slides: SlideRef[],
  rangeStart: number,
  endExclusive: number,
): Promise<Uint8Array> {
  const keep = slides.slice(rangeStart, endExclusive);
  const keepRIds = new Set(keep.map((s) => s.rId));
  const keepSlidePaths = new Set(keep.map((s) => posixJoin("ppt", s.target)));
  const dropSlidePaths = new Set(
    slides
      .filter((s) => !keepRIds.has(s.rId))
      .map((s) => posixJoin("ppt", s.target)),
  );

  const zip = await cloneZip(source);
  const presPath = "ppt/presentation.xml";
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const ctPath = "[Content_Types].xml";

  const presentationXml = await zip.file(presPath)!.async("string");
  const relsXml = await zip.file(relsPath)!.async("string");
  zip.file(presPath, rewritePresentationXml(presentationXml, keep));
  zip.file(relsPath, filterSlideRelationships(relsXml, keepRIds));

  const dropParts = new Set<string>();
  for (const path of dropSlidePaths) {
    zip.remove(path);
    dropParts.add(path);
    const slideRels = `${dirname(path)}/_rels/${path.split("/").pop()}.rels`;
    const relsFile = source.file(slideRels);
    if (relsFile) {
      const rels = await relsFile.async("string");
      const notesMatch = [...rels.matchAll(/<Relationship\b[^>]*\/?>/gi)].find(
        (m) => {
          const type = /\bType="([^"]+)"/i.exec(m[0] ?? "")?.[1];
          return type === NOTES_REL_TYPE;
        },
      );
      if (notesMatch) {
        const target = /\bTarget="([^"]+)"/i.exec(notesMatch[0]!)?.[1];
        if (target) {
          const notesPath = posixJoin(dirname(path), target);
          zip.remove(notesPath);
          dropParts.add(notesPath);
          const notesRels = `${dirname(notesPath)}/_rels/${notesPath.split("/").pop()}.rels`;
          if (zip.file(notesRels)) {
            zip.remove(notesRels);
            dropParts.add(notesRels);
          }
        }
      }
      zip.remove(slideRels);
      dropParts.add(slideRels);
    }
  }

  // GC: keep only parts reachable from presentation + kept slides.
  const visited = new Set<string>();
  const keepParts = new Set<string>([presPath, relsPath, ctPath]);
  keepParts.add("_rels/.rels");
  const fromPres = await collectTargetsFromRels(zip, relsPath, visited);
  for (const p of fromPres) keepParts.add(p);
  for (const slidePath of keepSlidePaths) {
    keepParts.add(slidePath);
    const slideRels = `${dirname(slidePath)}/_rels/${slidePath.split("/").pop()}.rels`;
    if (zip.file(slideRels)) {
      keepParts.add(slideRels);
      const nested = await collectTargetsFromRels(zip, slideRels, visited);
      for (const n of nested) keepParts.add(n);
    }
  }
  // Always keep package root leftovers that are not under ppt/media, charts, embeddings, notes
  const removablePrefixes = [
    "ppt/media/",
    "ppt/embeddings/",
    "ppt/charts/",
    "ppt/diagrams/",
    "ppt/drawings/",
    "ppt/notesSlides/",
  ];
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name]?.dir) continue;
    if (!removablePrefixes.some((p) => name.startsWith(p))) continue;
    if (!keepParts.has(name)) {
      zip.remove(name);
      dropParts.add(name);
      const relsSibling = `${dirname(name)}/_rels/${name.split("/").pop()}.rels`;
      if (zip.file(relsSibling)) {
        zip.remove(relsSibling);
        dropParts.add(relsSibling);
      }
    }
  }

  const ctFile = zip.file(ctPath);
  if (ctFile) {
    const ct = await ctFile.async("string");
    zip.file(ctPath, stripContentTypeOverrides(ct, dropParts));
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function splitPptxUnderLimit(
  source: File | ArrayBuffer,
  maxBytes: number,
  opts?: { nameStem?: string },
): Promise<SplitPptxOk | SplitPptxErr> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await toBytes(source));
  } catch {
    return {
      ok: false,
      reason: "invalid_pptx",
      message: "Could not read this PPTX",
    };
  }

  const presentationFile = zip.file("ppt/presentation.xml");
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels");
  if (!presentationFile || !relsFile) {
    return {
      ok: false,
      reason: "invalid_pptx",
      message: "Could not read this PPTX",
    };
  }

  let slides: SlideRef[] | null;
  try {
    slides = listSlides(
      await presentationFile.async("string"),
      await relsFile.async("string"),
    );
  } catch {
    return {
      ok: false,
      reason: "invalid_pptx",
      message: "Could not read this PPTX",
    };
  }

  if (!slides) {
    return {
      ok: false,
      reason: "invalid_pptx",
      message: "Could not read this PPTX",
    };
  }

  if (slides.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "This PPTX has no slides",
    };
  }

  const slideCount = slides.length;
  const partBytes: Uint8Array[] = [];
  let rangeStart = 0;
  let lastGood: Uint8Array | null = null;
  let lastGoodEnd = 0;

  for (let end = 1; end <= slideCount; end++) {
    const candidate = await serializeSlideRange(zip, slides, rangeStart, end);
    if (candidate.byteLength <= maxBytes) {
      lastGood = candidate;
      lastGoodEnd = end;
      continue;
    }

    if (lastGood && lastGoodEnd > rangeStart) {
      partBytes.push(lastGood);
      rangeStart = lastGoodEnd;
      lastGood = null;
      lastGoodEnd = rangeStart;
      end = rangeStart;
      continue;
    }

    return {
      ok: false,
      reason: "slide_too_large",
      slideCount,
      message:
        "A single slide is larger than the upload limit. Compress the PPTX externally and try again.",
    };
  }

  if (lastGood && lastGoodEnd > rangeStart) {
    partBytes.push(lastGood);
  }

  const stem = resolveStem(source, opts);
  const n = partBytes.length;
  const files = partBytes.map((bytes, i) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new File(
      [copy],
      formatSplitPartFilename({
        stem,
        index: i + 1,
        total: n,
        ext: "pptx",
      }),
      {
        type: PPTX_MIME,
      },
    );
  });

  return { ok: true, files };
}
