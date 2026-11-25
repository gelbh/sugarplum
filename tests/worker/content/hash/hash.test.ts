import { describe, expect, it } from "vitest";
import {
  resolveContentHashHitAction,
  sha256Hex,
  type ReadyHashHit,
} from "../../../../worker/materials/content-hash";

function hit(jobId: string | null): ReadyHashHit {
  return {
    materialId: "m1",
    jobId,
    kind: "pdf",
    r2_key: "k",
    filename: "f.pdf",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
    deck_id: "d1",
  };
}

describe("resolveContentHashHitAction", () => {
  it("reuses when a prior job exists and LO are absent", () => {
    expect(
      resolveContentHashHitAction(hit("j1"), { topicHints: null }),
    ).toBe("reuse");
  });

  it("enqueues when LO are present even if a prior job exists", () => {
    expect(
      resolveContentHashHitAction(hit("j1"), {
        topicHints: ["cell division"],
      }),
    ).toBe("enqueue_existing");
  });

  it("does not steer when attachOnly", () => {
    expect(
      resolveContentHashHitAction(hit("j1"), {
        topicHints: ["cell division"],
        attachOnly: true,
      }),
    ).toBe("reuse");
  });
});

describe("sha256Hex", () => {
  it("matches NIST SHA-256 empty-string vector", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable and distinguishes different inputs", async () => {
    const a = await sha256Hex("my notes");
    expect(a).toHaveLength(64);
    expect(await sha256Hex("my notes")).toBe(a);
    expect(await sha256Hex("other")).not.toBe(a);
  });
});
