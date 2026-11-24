import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractSidecarKey,
  getExtractSidecar,
  putExtractSidecar,
  deleteExtractSidecar,
} from "../../worker/generation/extractSidecar";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("extractSidecar", () => {
  it("uses a stable R2 key per job", () => {
    expect(extractSidecarKey("job-1")).toBe("generation-extract/job-1.json");
  });

  it("round-trips text, window resume, and drafts", async () => {
    const env = cfEnv;
    const drafts = [
      {
        type: "qa" as const,
        front: "What is mitochondria?",
        back: "Powerhouse of the cell.",
        provenance: { pages: [1], excerpt: "Mitochondria are" },
      },
    ];
    await putExtractSidecar(env, "job-a", {
      text: "Mitochondria are the powerhouse.",
      windowResume: {
        used_keys: ["p1"],
        next_page: 3,
        total_pages: 10,
      },
      drafts,
    });

    const loaded = await getExtractSidecar(env, "job-a");
    expect(loaded?.text).toBe("Mitochondria are the powerhouse.");
    expect(loaded?.windowResume?.total_pages).toBe(10);
    expect(loaded?.drafts).toEqual(drafts);

    await deleteExtractSidecar(env, "job-a");
    expect(await getExtractSidecar(env, "job-a")).toBeNull();
  });

  it("resolves sandbox owner via materials→decks join (no generation_jobs.user_id)", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Bio",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-a",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-join",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });

    await expect(
      putExtractSidecar(env, "job-join", {
        text: "short paste",
        windowResume: null,
        drafts: [],
      }),
    ).resolves.toBeUndefined();
    const loaded = await getExtractSidecar(env, "job-join");
    expect(loaded?.text).toBe("short paste");
  });
});
