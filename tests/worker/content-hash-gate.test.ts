import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  getMaterials,
  getR2Keys,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedOwnerDeck(
  env: Bindings,
  opts?: { deckId?: string; userId?: string },
) {
  const userId = opts?.userId ?? "user-a";
  const deckId = opts?.deckId ?? "deck-a";
  await seedUser(env, {
    id: userId,
    email: `${userId}@example.com`,
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: deckId,
    user_id: userId,
    title: "Deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, `sess-${userId}`, userId);
  return { userId, deckId, cookie: `${SESSION_COOKIE}=sess-${userId}` };
}

describe("same-deck content-hash generate gate", () => {
  it("reuses prior job on second identical paste", async () => {
    const env = cfEnv;
    const { deckId, cookie } = await seedOwnerDeck(env);

    const first = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: "same notes" }),
      },
      env,
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { id: string; jobId: string };
    expect(firstBody.jobId).toBeTruthy();
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect((await getMaterials(env))).toHaveLength(1);

    const second = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: "same notes" }),
      },
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      id: string;
      jobId: string;
      reused?: boolean;
    };
    expect(secondBody.jobId).toBe(firstBody.jobId);
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.reused).toBe(true);
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect((await getMaterials(env))).toHaveLength(1);
  });

  it("still generates when same bytes land on another deck", async () => {
    const env = cfEnv;
    const a = await seedOwnerDeck(env, { deckId: "deck-a", userId: "user-a" });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-a",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const first = await app.request(
      `/api/decks/${a.deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: a.cookie },
        body: JSON.stringify({ text: "shared bytes" }),
      },
      env,
    );
    const firstBody = (await first.json()) as { jobId: string };

    const second = await app.request(
      "/api/decks/deck-b/materials/paste",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: a.cookie },
        body: JSON.stringify({ text: "shared bytes" }),
      },
      env,
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { jobId: string };
    expect(secondBody.jobId).not.toBe(firstBody.jobId);
    expect((await getGenerationJobs(env))).toHaveLength(2);
  });

  it("reuses a failed prior job instead of enqueueing again", async () => {
    const env = cfEnv;
    const { deckId, cookie } = await seedOwnerDeck(env);

    const first = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: "will fail" }),
      },
      env,
    );
    const firstBody = (await first.json()) as { id: string; jobId: string };
    const jobs = (await getGenerationJobs(env));
    const job = jobs.find((j) => j.id === firstBody.jobId);
    expect(job).toBeTruthy();
    if (job) {
      job.status = "failed";
      job.error = "boom";
    }

    const second = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: "will fail" }),
      },
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { jobId: string };
    expect(secondBody.jobId).toBe(firstBody.jobId);
    expect((await getGenerationJobs(env))).toHaveLength(1);
  });

  it("enqueues on orphan ready material with no job row", async () => {
    const env = cfEnv;
    const { deckId, cookie } = await seedOwnerDeck(env);
    const { sha256Hex } = await import("../../worker/materials/content-hash");
    const hash = await sha256Hex("orphan notes");

    await seedMaterial(env, {
      id: "mat-orphan",
      deck_id: deckId,
      kind: "paste",
      r2_key: "materials/deck-a/mat-orphan.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      content_hash: hash,
    });
    await seedR2(env, "materials/deck-a/mat-orphan.txt", "orphan notes");

    const res = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: "orphan notes" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; jobId: string };
    expect(body.id).toBe("mat-orphan");
    expect(body.jobId).toBeTruthy();
    expect((await getMaterials(env))).toHaveLength(1);
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect((await getGenerationJobs(env))[0]?.material_id).toBe("mat-orphan");
  });

  it("on complete duplicate deletes provisional and returns prior job", async () => {
    const env = cfEnv;
    const { deckId, cookie } = await seedOwnerDeck(env);
    const bytes = "pdf-bytes-identical";

    const firstPaste = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: bytes }),
      },
      env,
    );
    const prior = (await firstPaste.json()) as { id: string; jobId: string };

    await seedMaterial(env, {
      id: "mat-upload",
      deck_id: deckId,
      kind: "pdf",
      r2_key: "materials/deck-a/mat-upload.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedR2(env, "materials/deck-a/mat-upload.pdf", bytes);

    const complete = await app.request(
      "/api/materials/mat-upload/complete",
      {
        method: "POST",
        headers: { cookie },
      },
      env,
    );
    expect(complete.status).toBe(200);
    const body = (await complete.json()) as {
      id: string;
      jobId: string;
      reused?: boolean;
    };
    expect(body.reused).toBe(true);
    expect(body.jobId).toBe(prior.jobId);
    expect(body.id).toBe(prior.id);
    expect((await getMaterials(env)).find((m) => m.id === "mat-upload")).toBeUndefined();
    expect((await getR2Keys(env))).not.toContain("materials/deck-a/mat-upload.pdf");
    expect((await getGenerationJobs(env))).toHaveLength(1);
  });

  it("enqueues a new job when paste hash-hits but topicHints are set", async () => {
    const env = cfEnv;
    const { deckId, cookie } = await seedOwnerDeck(env);

    const first = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: "same notes" }),
      },
      env,
    );
    const firstBody = (await first.json()) as { id: string; jobId: string };

    const second = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          text: "same notes",
          topicHints: ["Focus on virulence factors"],
        }),
      },
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      id: string;
      jobId: string;
      reused?: boolean;
    };
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.jobId).not.toBe(firstBody.jobId);
    expect(secondBody.reused).not.toBe(true);
    expect((await getGenerationJobs(env))).toHaveLength(2);
    const steered = (await getGenerationJobs(env))
      .find((j) => j.id === secondBody.jobId);
    expect(steered?.topic_hints_json).toContain("virulence");
  });

  it("enqueues a new job when complete hash-hits but topicHints are set", async () => {
    const env = cfEnv;
    const { deckId, cookie } = await seedOwnerDeck(env);
    const bytes = "pdf-bytes-with-lo";

    const firstPaste = await app.request(
      `/api/decks/${deckId}/materials/paste`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: bytes }),
      },
      env,
    );
    const prior = (await firstPaste.json()) as { id: string; jobId: string };

    await seedMaterial(env, {
      id: "mat-upload-lo",
      deck_id: deckId,
      kind: "pdf",
      r2_key: "materials/deck-a/mat-upload-lo.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedR2(env, "materials/deck-a/mat-upload-lo.pdf", bytes);

    const complete = await app.request(
      "/api/materials/mat-upload-lo/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          topicHints: ["Cover Gram stain workflow"],
        }),
      },
      env,
    );
    expect(complete.status).toBe(200);
    const body = (await complete.json()) as {
      id: string;
      jobId: string;
      reused?: boolean;
    };
    expect(body.id).toBe(prior.id);
    expect(body.jobId).not.toBe(prior.jobId);
    expect(body.reused).not.toBe(true);
    expect((await getMaterials(env)).find((m) => m.id === "mat-upload-lo")).toBeUndefined();
    expect((await getGenerationJobs(env))).toHaveLength(2);
    const steered = (await getGenerationJobs(env)).find((j) => j.id === body.jobId);
    expect(steered?.material_id).toBe(prior.id);
    expect(steered?.topic_hints_json).toContain("Gram stain");
  });
});
