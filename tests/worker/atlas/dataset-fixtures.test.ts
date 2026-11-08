import { describe, expect, it } from "vitest";
import {
  loadGroupFiles,
  loadParasiteDataset,
} from "../../../worker/atlas/datasets/parasites";
import type { DatasetEntry } from "../../../worker/atlas/datasets/schema";
import {
  HOST_TERMS,
  ORGAN_TERMS,
  hostCovers,
  organCovers,
} from "../../../worker/atlas/datasets/vocab";
import manifest from "../../eval/atlas/course-taxa.json";
import parasites from "../../eval/atlas/parasites.json";
import {
  HOST_ALIASES,
  ORGAN_ALIASES,
  resolveHost,
  resolveOrgan,
} from "./fixture-terms";

type Fields = DatasetEntry["fields"];
type Fixture = {
  canonicalName: string;
  expected: Partial<Record<keyof Fields, unknown>>;
};
const fixtures: Fixture[] = parasites.entries;

const authoredFiles = new Set(loadGroupFiles().map((f) => f.file));
const byName = new Map(
  loadParasiteDataset().entries.map((e) => [e.canonicalName, e]),
);
const fileOf = new Map(manifest.taxa.map((t) => [t.canonicalName, t.file]));
const due = fixtures.filter((f) =>
  authoredFiles.has(fileOf.get(f.canonicalName) ?? ""),
);

type Compare = (label: string, got: Fields, want: unknown) => void;

const exact =
  (key: "group" | "family" | "zoonotic" | "lifecycleType"): Compare =>
  (label, got, want) =>
    expect(got[key], label).toBe(want);

const hosts =
  (key: "definitiveHosts" | "intermediateHosts" | "paratenicHosts"): Compare =>
  (label, got, want) => {
    for (const term of want as string[]) {
      const g = resolveHost(term);
      expect(g, `${label}: unknown fixture host "${term}"`).not.toBeNull();
      const ok = got[key].some((d) => hostCovers(g!, d));
      expect(ok, `${label}: nothing in [${got[key]}] is a "${g}"`).toBe(true);
    }
  };

const COMPARE: Partial<Record<keyof Fields, Compare>> = {
  group: exact("group"),
  family: exact("family"),
  zoonotic: exact("zoonotic"),
  lifecycleType: exact("lifecycleType"),
  definitiveHosts: hosts("definitiveHosts"),
  intermediateHosts: hosts("intermediateHosts"),
  paratenicHosts: hosts("paratenicHosts"),
  majorOrgan: (label, got, want) => {
    const g = resolveOrgan(want as string);
    expect(g, `${label}: unknown fixture organ "${want}"`).not.toBeNull();
    expect(got.majorOrgan, `${label} missing`).not.toBeNull();
    expect(
      organCovers(g!, got.majorOrgan!),
      `${label} ${got.majorOrgan} vs ${g}`,
    ).toBe(true);
  },
  pppDays: (label, got, want) => {
    const f = want as { min: number; max: number };
    const d = got.pppDays;
    expect(d, `${label} missing`).not.toBeNull();
    expect(
      d!.min <= f.max && f.min <= d!.max,
      `${label} ${JSON.stringify(d)} vs ${JSON.stringify(f)}`,
    ).toBe(true);
  },
};

describe("dataset agrees with the hand-checked fixtures", () => {
  it("checks at least one fixture once a dataset file is authored", () => {
    if (authoredFiles.size > 0) expect(due.length).toBeGreaterThan(0);
  });

  it("every fixture taxon is in the course manifest", () => {
    for (const f of fixtures)
      expect(fileOf.has(f.canonicalName), f.canonicalName).toBe(true);
  });

  it.each(due.map((f) => [f.canonicalName, f] as const))(
    "%s",
    (name, fixture) => {
      const entry = byName.get(name);
      expect(entry, `${name} missing from dataset`).toBeDefined();
      for (const [key, want] of Object.entries(fixture.expected)) {
        const compare = COMPARE[key as keyof Fields];
        if (!compare)
          throw new Error(`no comparison rule for fixture field ${key}`);
        compare(`${name}.${key}`, entry!.fields, want);
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

describe("fixture spellings", () => {
  it("resolves aliases and scientific names", () => {
    expect(resolveHost("Canids")).toBe("canid");
    expect(resolveHost("galba truncatula")).toBe("Galba truncatula");
    expect(resolveOrgan("Pulmonary")).toBe("lungs");
  });

  it("does not resolve inherited object properties", () => {
    expect(resolveHost("constructor")).toBeNull();
    expect(resolveOrgan("toString")).toBeNull();
  });

  const pairs = [
    [HOST_ALIASES, HOST_TERMS],
    [ORGAN_ALIASES, ORGAN_TERMS],
  ] as const;

  it("points every alias at an existing term", () => {
    for (const [aliases, terms] of pairs) {
      for (const [alias, target] of Object.entries(aliases)) {
        expect(Object.hasOwn(terms, target), `${alias} -> ${target}`).toBe(
          true,
        );
      }
    }
  });

  it("writes every alias in lower case", () => {
    for (const [aliases] of pairs) {
      for (const alias of Object.keys(aliases)) {
        expect(alias, alias).toBe(alias.toLowerCase());
      }
    }
  });

  it("never shadows a term with an alias", () => {
    for (const [aliases, terms] of pairs) {
      const lowered = new Set(Object.keys(terms).map((k) => k.toLowerCase()));
      for (const alias of Object.keys(aliases)) {
        expect(lowered.has(alias), alias).toBe(false);
      }
    }
  });
});
