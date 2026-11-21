import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { materialMentionsForPack } from "../../../src/atlas/hub/packMatch";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";

// Synthetic lecture-style snippets only; never paste slide text here.
type Snippet = {
  id: string;
  text: string;
  shouldMatch: string[];
  shouldNotMatch: string[];
};

const snippets = JSON.parse(
  readFileSync(new URL("./pack-match-labelled.json", import.meta.url), "utf8"),
) as Snippet[];

// Same name forms the worker scans: toEntryView folds misspellings into aliases.
const entries = new Map(
  loadParasiteDataset().entries.map((e) => [
    e.key,
    {
      canonicalName: e.canonicalName,
      commonName: e.commonName,
      aliases: [...e.aliases, ...e.misspellings],
    },
  ]),
);

const MIN_RECALL = 0.95;
const MIN_PRECISION = 0.85;

function matches(key: string, text: string): boolean {
  const entry = entries.get(key);
  if (!entry) throw new Error(`Unknown atlas key in fixture: ${key}`);
  return materialMentionsForPack(entry, {
    id: "snippet",
    filename: null,
    sourceRole: "lecture",
    pages: [{ page: 1, text }],
  });
}

describe("labelled pack-match eval", () => {
  it("keeps recall and precision above the thresholds", () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    const misses: string[] = [];
    for (const s of snippets) {
      for (const key of s.shouldMatch) {
        if (matches(key, s.text)) tp += 1;
        else {
          fn += 1;
          misses.push(`missed ${key} in ${s.id}`);
        }
      }
      for (const key of s.shouldNotMatch) {
        if (matches(key, s.text)) {
          fp += 1;
          misses.push(`false hit ${key} in ${s.id}`);
        }
      }
    }
    const recall = tp / (tp + fn);
    const precision = tp / (tp + fp);
    const summary = `recall ${recall.toFixed(3)}, precision ${precision.toFixed(3)} (tp ${tp}, fp ${fp}, fn ${fn})`;
    console.info(`pack-match eval: ${summary}`);
    const report = [summary, ...misses].join("\n");
    expect(recall, report).toBeGreaterThanOrEqual(MIN_RECALL);
    expect(precision, report).toBeGreaterThanOrEqual(MIN_PRECISION);
  });
});
