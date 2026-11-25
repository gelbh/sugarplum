import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import {
  expectedViewAsAnnotation,
  type ViewAsAnnotation,
} from "../../../worker/admin/viewAsRoutePolicy";

const WORKER_ROOT = join(process.cwd(), "worker");
const TAG_RE = /^\/\/ view-as: (allow|deny)\s*$/;
const VERB_RE =
  /(?<recv>\w+)\.(?<method>get|post|put|patch|delete)\(\s*(?<q>["'`])(?<path>[^"'`]+)\k<q>/;
const TOP_MOUNT_RE =
  /app\.route\(\s*(?<q>["'`])(?<prefix>[^"'`]+)\k<q>\s*,\s*(?<recv>\w+)\s*\)/g;
const NEST_MOUNT_RE =
  /(?<parent>\w+)\.route\(\s*(?<q>["'`])(?<prefix>[^"'`]+)\k<q>\s*,\s*(?<child>\w+)\s*\)/g;

type ScrapedRoute = {
  file: string;
  line: number;
  receiver: string;
  method: string;
  relativePath: string;
  fullPath: string;
  tag: ViewAsAnnotation | null;
};

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...listTsFiles(abs));
    } else if (name.endsWith(".ts")) {
      out.push(abs);
    }
  }
  return out;
}

function joinMount(prefix: string, rel: string): string {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (!rel || rel === "/") return p || "/";
  const r = rel.startsWith("/") ? rel : `/${rel}`;
  return `${p}${r}`;
}

function isRouteReceiver(name: string): boolean {
  return name.endsWith("Routes") || name === "app";
}

function buildReceiverPrefixes(): Map<string, string> {
  const indexSrc = readFileSync(join(WORKER_ROOT, "index.ts"), "utf8");
  const prefixes = new Map<string, string>();
  for (const m of indexSrc.matchAll(TOP_MOUNT_RE)) {
    prefixes.set(m.groups!.recv, m.groups!.prefix);
  }

  // Nested mounts: child inherits parent prefix + nested segment.
  // Resolve in a few passes so order of discovery does not matter.
  const nestEdges: Array<{ parent: string; prefix: string; child: string }> =
    [];
  for (const abs of listTsFiles(WORKER_ROOT)) {
    const src = readFileSync(abs, "utf8");
    for (const m of src.matchAll(NEST_MOUNT_RE)) {
      nestEdges.push({
        parent: m.groups!.parent,
        prefix: m.groups!.prefix,
        child: m.groups!.child,
      });
    }
  }
  for (let i = 0; i < 8; i++) {
    let grew = false;
    for (const edge of nestEdges) {
      const parentPrefix = prefixes.get(edge.parent);
      if (!parentPrefix) continue;
      const childPrefix = joinMount(parentPrefix, edge.prefix);
      const prev = prefixes.get(edge.child);
      if (prev !== childPrefix) {
        prefixes.set(edge.child, childPrefix);
        grew = true;
      }
    }
    if (!grew) break;
  }
  return prefixes;
}

function previousNonEmptyLine(lines: string[], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const t = lines[i]!.trim();
    if (t.length === 0) continue;
    return t;
  }
  return null;
}

function scrapeAnnotatedRoutes(
  prefixes: Map<string, string>,
): ScrapedRoute[] {
  const out: ScrapedRoute[] = [];
  for (const abs of listTsFiles(WORKER_ROOT)) {
    const relFile = relative(process.cwd(), abs);
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const m = VERB_RE.exec(line);
      if (!m?.groups) continue;
      const receiver = m.groups.recv;
      if (!isRouteReceiver(receiver)) continue;
      const method = m.groups.method.toUpperCase();
      const relativePath = m.groups.path;
      const mount = prefixes.get(receiver);
      if (!mount) {
        throw new Error(
          `No mount prefix for receiver ${receiver} at ${relFile}:${i + 1}`,
        );
      }
      const prev = previousNonEmptyLine(lines, i);
      const tagMatch = prev ? TAG_RE.exec(prev) : null;
      out.push({
        file: relFile,
        line: i + 1,
        receiver,
        method,
        relativePath,
        fullPath: joinMount(mount, relativePath),
        tag: tagMatch ? (tagMatch[1] as ViewAsAnnotation) : null,
      });
    }
  }
  return out;
}

describe("view-as route annotations", () => {
  it("tags every /api handler and matches middleware policy", () => {
    const prefixes = buildReceiverPrefixes();
    const scraped = scrapeAnnotatedRoutes(prefixes);

    expect(scraped.length).toBeGreaterThan(50);

    const missing = scraped.filter((r) => r.tag === null);
    expect(
      missing.map((r) => `${r.method} ${r.fullPath} (${r.file}:${r.line})`),
      "every Hono verb registration needs // view-as: allow|deny above it",
    ).toEqual([]);

    const mismatches = scraped
      .filter((r) => r.tag !== null)
      .filter((r) => r.tag !== expectedViewAsAnnotation(r.method, r.fullPath))
      .map(
        (r) =>
          `${r.method} ${r.fullPath}: tagged ${r.tag}, expected ${expectedViewAsAnnotation(r.method, r.fullPath)} (${r.file}:${r.line})`,
      );
    expect(mismatches).toEqual([]);

    const keyed = new Map<string, ScrapedRoute>();
    for (const r of scraped) {
      keyed.set(`${r.method} ${r.fullPath}`, r);
    }

    const runtime = app.routes.filter((r) => r.method !== "ALL");
    const uncovered = runtime
      .filter((r) => !keyed.has(`${r.method} ${r.path}`))
      .map((r) => `${r.method} ${r.path}`);
    expect(
      uncovered,
      "app.routes entries must appear in the scraped annotation map",
    ).toEqual([]);

    const extra = [...keyed.keys()].filter((k) => {
      const [method, ...rest] = k.split(" ");
      const path = rest.join(" ");
      return !runtime.some((r) => r.method === method && r.path === path);
    });
    expect(
      extra,
      "scraped routes should not invent paths absent from app.routes",
    ).toEqual([]);
  });
});
