import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadGroupFiles,
  loadParasiteDataset,
} from "../../../worker/atlas/datasets/parasites";
import {
  hostCovers,
  organCovers,
  resolveHost,
  resolveOrgan,
} from "../../../worker/atlas/datasets/vocab";

type Fixture = {
  canonicalName: string;
  slideErrors: string[];
  expected: Record<string, unknown>;
};
const read = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const fixtures = (
  read("../../eval/atlas/parasites.json") as { entries: Fixture[] }
).entries;
const manifest = read("../../eval/atlas/course-taxa.json") as {
  taxa: { canonicalName: string; file: string }[];
};

const authoredFiles = new Set(loadGroupFiles().map((f) => f.file));
const byName = new Map(
  loadParasiteDataset().entries.map((e) => [e.canonicalName, e]),
);
const fileOf = new Map(manifest.taxa.map((t) => [t.canonicalName, t.file]));
const due = fixtures.filter((f) =>
  authoredFiles.has(fileOf.get(f.canonicalName) ?? ""),
);

const EXACT = new Set(["group", "family", "zoonotic", "lifecycleType"]);
const HOSTS = new Set([
  "definitiveHosts",
  "intermediateHosts",
  "paratenicHosts",
]);

describe("dataset agrees with the hand-checked fixtures", () => {
  it("every fixture taxon is in the course manifest", () => {
    for (const f of fixtures)
      expect(fileOf.has(f.canonicalName), f.canonicalName).toBe(true);
  });

  it.each(due.map((f) => [f.canonicalName, f] as const))(
    "%s",
    (name, fixture) => {
      const entry = byName.get(name);
      expect(entry, `${name} missing from dataset`).toBeDefined();
      const fields = entry!.fields as Record<string, unknown>;
      for (const [key, want] of Object.entries(fixture.expected)) {
        const got = fields[key];
        if (EXACT.has(key)) {
          expect(got, `${name}.${key}`).toBe(want);
        } else if (HOSTS.has(key)) {
          for (const term of want as string[]) {
            const g = resolveHost(term);
            expect(
              g,
              `${name}.${key}: unknown fixture host "${term}"`,
            ).not.toBeNull();
            const ok = (got as string[]).some((d) => hostCovers(g!, d));
            expect(ok, `${name}.${key}: nothing in [${got}] is a "${g}"`).toBe(
              true,
            );
          }
        } else if (key === "majorOrgan") {
          const g = resolveOrgan(want as string);
          expect(g, `${name}: unknown fixture organ "${want}"`).not.toBeNull();
          expect(
            organCovers(g!, got as string),
            `${name}.majorOrgan ${got} vs ${g}`,
          ).toBe(true);
        } else if (key === "pppDays") {
          const f = want as { min: number; max: number };
          const d = got as { min: number; max: number } | null;
          expect(d, `${name}.pppDays missing`).not.toBeNull();
          expect(
            d!.min <= f.max && f.min <= d!.max,
            `${name}.pppDays ${JSON.stringify(d)} vs ${JSON.stringify(f)}`,
          ).toBe(true);
        } else {
          throw new Error(`no comparison rule for fixture field ${key}`);
        }
      }
    },
  );

  it.skipIf(!authoredFiles.has("cestodes"))(
    "corrects the Dipylidium family slide error",
    () => {
      expect(byName.get("Dipylidium caninum")?.fields.family).toBe(
        "Dipylidiidae",
      );
    },
  );
});
