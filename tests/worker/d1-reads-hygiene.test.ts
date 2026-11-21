import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dueQueue SQL hygiene", () => {
  it("does not correlate again_14d per card in loadDueCandidates SQL", () => {
    const src = readFileSync("worker/study/dueQueue.ts", "utf8");
    expect(src).not.toMatch(
      /SELECT COUNT\(\*\) FROM review_logs rl\s+WHERE rl\.card_id = c\.id/s,
    );
    expect(src).toMatch(/d2\.user_id/);
  });
});

describe("struggling SQL hygiene", () => {
  it("struggling route avoids dual correlated review_logs counts", () => {
    const src = readFileSync("worker/study/routes.ts", "utf8");
    const block = src.slice(src.indexOf('studyRoutes.get("/struggling"'));
    const dual =
      (block.match(/SELECT COUNT\(\*\) FROM review_logs/g) ?? []).length >= 2 &&
      block.includes("rl.card_id = c.id");
    expect(dual).toBe(false);
  });
});

describe("admin list SQL hygiene", () => {
  it("admin list avoids per-row correlated deck_count probes", () => {
    const listSrc = readFileSync("worker/admin/list-users.ts", "utf8");
    expect(listSrc).not.toMatch(
      /SELECT COUNT\(\*\) FROM decks d WHERE d\.user_id = u\.id/,
    );
    expect(listSrc).toMatch(/sugarplum:admin-list-lean/);
    expect(listSrc).toMatch(/sugarplum:admin-list-metrics/);
    expect(listSrc).toMatch(/GROUP BY user_id/);
  });

  it("overview route does not sum all usage_events unbounded", () => {
    const src = readFileSync("worker/admin/routes.ts", "utf8");
    const block = src.slice(src.indexOf('adminRoutes.get("/overview"'));
    expect(block).not.toMatch(
      /SUM\(COALESCE\(tokens_total, 0\)\) FROM usage_events\)/,
    );
  });
});
