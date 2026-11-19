import { describe, it, expect, afterEach, vi } from "vitest";
import { State } from "ts-fsrs";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { getDb } from "../../worker/db/client";
import {
  CloneLimitExceededError,
  cloneUserGraph,
} from "../../worker/admin/clone-user";
import { createTestEnv } from "./test-env";

const ADMIN_EMAIL = "ops@example.com";
const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};
const NOW = "2026-01-01T12:00:00.000Z";
const SOURCE_R2 = "users/u-alice/decks/deck-a/materials/mat-1.pdf";

function seedAdminAndLearnerWithLibrary(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "admin-u",
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2025-01-01T00:00:00.000Z",
  });
  env.seedUser({
    id: "u-alice",
    email: "alice@example.com",
    password_hash: null,
    oauth_subject: "google-alice",
    created_at: "2026-10-28T00:00:00.000Z",
  });
  env.seedUserSecret({
    user_id: "u-alice",
    provider: "openai",
    ciphertext: "cipher-alice",
    created_at: NOW,
    updated_at: NOW,
  });
  env.seedSubject({
    id: "subj-a",
    user_id: "u-alice",
    title: "Anatomy",
    created_at: NOW,
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "u-alice",
    title: "Spine",
    subject_hint: null,
    subject_id: "subj-a",
    created_at: NOW,
  });
  env.seedMaterial({
    id: "mat-1",
    deck_id: "deck-a",
    kind: "pdf",
    r2_key: SOURCE_R2,
    filename: "spine.pdf",
    page_count: 3,
    status: "ready",
    created_at: NOW,
    content_hash: "hash-1",
    source_role: "lecture",
  });
  env.seedCard({
    id: "card-a",
    deck_id: "deck-a",
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("What is C1?"),
    back_json: JSON.stringify("Atlas"),
    media_r2_keys_json: null,
    provenance_json: null,
    status: "accepted",
    created_at: NOW,
    updated_at: NOW,
  });
  env.seedSchedule({
    card_id: "card-a",
    due: "2020-01-01T00:00:00.000Z",
    stability: 40,
    difficulty: 5,
    elapsed_days: 30,
    scheduled_days: 30,
    learning_steps: 0,
    reps: 8,
    lapses: 0,
    state: State.Review,
    last_review: "2025-12-01T12:00:00.000Z",
  });
  env.seedUserStudyPrefs({
    user_id: "u-alice",
    intro_budget: 12,
    review_budget: 150,
    r_floor: 0.85,
    desired_retention: 0.9,
    enable_fuzz: 1,
    enable_load_balance: 1,
    easy_days_json:
      '["normal","normal","normal","normal","normal","normal","normal"]',
    updated_at: NOW,
  });
  env.seedUserStudyDay({
    user_id: "u-alice",
    day: "2026-01-01",
    intros_used: 3,
  });
  env.seedUserGamification({
    user_id: "u-alice",
    streak_current: 2,
    streak_best: 5,
    streak_day: "2026-01-01",
    xp_total: 40,
    level: 2,
    display_name: "Alice",
    board_opt_in: 1,
    updated_at: NOW,
    clear_due_days: 0,
    clear_due_last_day: null,
    catalog_version: 1,
  });
  env.seedGenerationJob({
    id: "job-running",
    material_id: "mat-1",
    status: "running",
    error: null,
    coverage_json: null,
    progress_json: JSON.stringify({ heartbeat_at: NOW }),
    created_at: NOW,
    finished_at: null,
    topic_hints_json: JSON.stringify(["hint"]),
    avoid_patterns_json: JSON.stringify(["avoid"]),
    run_topic_hints_json: JSON.stringify(["run"]),
    atlas_provenance_json: null,
  });
  env.seedSession("s-admin", "admin-u");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin impersonation D1 clone", () => {
  it("clones remapped learner rows and leaves source counts unchanged", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = body.impersonation.sandboxUserId;

    const sourceDecks = env.getDecks().filter((d) => d.user_id === "u-alice");
    const sandboxDecks = env.getDecks().filter((d) => d.user_id === sandboxId);
    expect(sourceDecks).toHaveLength(1);
    expect(sandboxDecks).toHaveLength(1);
    expect(sandboxDecks[0]!.id).not.toBe("deck-a");
    expect(sandboxDecks[0]!.title).toBe("Spine");

    const sourceCards = env
      .getCards()
      .filter((c) => sourceDecks.some((d) => d.id === c.deck_id));
    const sandboxCards = env
      .getCards()
      .filter((c) => sandboxDecks.some((d) => d.id === c.deck_id));
    expect(sourceCards).toHaveLength(1);
    expect(sandboxCards).toHaveLength(1);
    expect(sandboxCards[0]!.id).not.toBe("card-a");
    expect(sandboxCards[0]!.front_json).toBe(JSON.stringify("What is C1?"));

    const sandboxMaterials = env
      .getMaterials()
      .filter((m) => sandboxDecks.some((d) => d.id === m.deck_id));
    expect(sandboxMaterials).toHaveLength(1);
    expect(sandboxMaterials[0]!.r2_key).toBe(SOURCE_R2);
    expect(sandboxMaterials[0]!.id).not.toBe("mat-1");

    expect(env.getUserSecrets().some((s) => s.user_id === sandboxId)).toBe(
      false,
    );
    expect(env.getUserSecrets().some((s) => s.user_id === "u-alice")).toBe(
      true,
    );

    const prefs = env
      .getUserStudyPrefs()
      .find((p) => p.user_id === sandboxId);
    expect(prefs?.intro_budget).toBe(12);
    expect(prefs?.review_budget).toBe(150);

    expect(env.getUserGamification(sandboxId)?.board_opt_in).toBe(0);
    expect(env.getUserGamification("u-alice")?.board_opt_in).toBe(1);

    const sandboxJobs = env
      .getGenerationJobs()
      .filter((j) =>
        sandboxMaterials.some((m) => m.id === j.material_id),
      );
    expect(sandboxJobs).toHaveLength(1);
    expect(sandboxJobs[0]!.status).toBe("failed");
    expect(sandboxJobs[0]!.progress_json).toBeNull();
    expect(sandboxJobs[0]!.avoid_patterns_json).toBe(JSON.stringify(["avoid"]));
    expect(sandboxJobs[0]!.run_topic_hints_json).toBe(JSON.stringify(["run"]));
    expect(env.getGenerationJobs().find((j) => j.id === "job-running")!.status).toBe(
      "running",
    );
  });

  it("clones atlas course pack materials with read-through R2 keys", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    const packR2 = "atlas/atlas-alice/pack-1.txt";
    env.seedAtlas({
      id: "atlas-alice",
      user_id: "u-alice",
      template_key: "parasite",
      created_at: NOW,
    });
    env.seedAtlasMaterial({
      id: "pack-1",
      atlas_id: "atlas-alice",
      kind: "paste",
      r2_key: packR2,
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: NOW,
      content_hash: "pack-hash",
      source_role: "tutorial",
    });
    env.seedR2(packR2, "Fasciola hepatica tutorial notes");
    await env.DB.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "atlas-alice",
        "fasciola-hepatica",
        "standard",
        "Standard",
        "[]",
        null,
        NOW,
      )
      .run();

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = body.impersonation.sandboxUserId;

    const sandboxAtlases = env
      .getAtlases()
      .filter((a) => a.user_id === sandboxId);
    expect(sandboxAtlases).toHaveLength(1);
    expect(sandboxAtlases[0]!.id).not.toBe("atlas-alice");

    const sandboxPack = env
      .getAtlasMaterials()
      .filter((m) => m.atlas_id === sandboxAtlases[0]!.id);
    expect(sandboxPack).toHaveLength(1);
    expect(sandboxPack[0]!.id).not.toBe("pack-1");
    expect(sandboxPack[0]!.source_role).toBe("tutorial");
    // Read-through: same R2 key as source (no byte-copy on impersonate).
    expect(sandboxPack[0]!.r2_key).toBe(packR2);
    expect(env.getR2(packR2)).toBe("Fasciola hepatica tutorial notes");

    const sandboxAtlasId = sandboxAtlases[0]!.id;
    const staleFocus = await env.DB.prepare(
      `SELECT tier FROM atlas_entry_focus
       WHERE atlas_id = ? AND entry_key = ?`,
    )
      .bind(sandboxAtlasId, "fasciola-hepatica")
      .first<{ tier: string }>();
    expect(staleFocus?.tier).toBe("standard");
    expect(sandboxAtlases[0]!.focus_pack_fingerprint ?? null).toBeNull();

    const list = await app.request(
      `/api/atlas/${sandboxAtlasId}/entries`,
      { headers: adminHeaders },
      env,
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      entries: Array<{ id: string; tier: string | null; reason: string | null }>;
    };
    expect(
      listed.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
    expect(
      env.getAtlases().find((a) => a.id === sandboxAtlasId)
        ?.focus_pack_fingerprint,
    ).toMatch(/^v1:/);
  });

  it("study edit mutates sandbox only; source unchanged after Exit", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = body.impersonation.sandboxUserId;

    const sandboxDeck = env.getDecks().find((d) => d.user_id === sandboxId)!;
    const sandboxCard = env
      .getCards()
      .find((c) => c.deck_id === sandboxDeck.id)!;
    const sourceFrontBefore = env
      .getCards()
      .find((c) => c.id === "card-a")!.front_json;
    const sourceScheduleBefore = {
      ...env.getSchedules().find((s) => s.card_id === "card-a")!,
    };

    const patch = await app.request(
      `/api/cards/${sandboxCard.id}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ front: "Edited under impersonation?" }),
      },
      env,
    );
    expect(patch.status).toBe(200);

    expect(env.getCards().find((c) => c.id === "card-a")!.front_json).toBe(
      sourceFrontBefore,
    );
    expect(
      env.getCards().find((c) => c.id === sandboxCard.id)!.front_json,
    ).toBe(JSON.stringify("Edited under impersonation?"));

    const reset = await app.request(
      `/api/cards/${sandboxCard.id}/reset-schedule`,
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(reset.status).toBe(200);

    const sourceScheduleMid = env
      .getSchedules()
      .find((s) => s.card_id === "card-a")!;
    expect(sourceScheduleMid.reps).toBe(sourceScheduleBefore.reps);
    expect(sourceScheduleMid.due).toBe(sourceScheduleBefore.due);

    const sandboxSchedule = env
      .getSchedules()
      .find((s) => s.card_id === sandboxCard.id)!;
    expect(sandboxSchedule.reps).toBe(0);
    expect(sandboxSchedule.due).not.toBe(sourceScheduleBefore.due);

    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(exit.status).toBe(200);

    expect(env.getCards().find((c) => c.id === "card-a")!.front_json).toBe(
      sourceFrontBefore,
    );
    const sourceScheduleAfter = env
      .getSchedules()
      .find((s) => s.card_id === "card-a")!;
    expect(sourceScheduleAfter.reps).toBe(sourceScheduleBefore.reps);
    expect(sourceScheduleAfter.due).toBe(sourceScheduleBefore.due);
    expect(env.getUsers().some((u) => u.id === sandboxId)).toBe(false);
  });

  it("deleting cloned material does not delete source R2 key", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    env.seedR2(SOURCE_R2, "pdf-bytes");

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxDeck = env
      .getDecks()
      .find((d) => d.user_id === body.impersonation.sandboxUserId)!;
    const sandboxMaterial = env
      .getMaterials()
      .find((m) => m.deck_id === sandboxDeck.id)!;

    const del = await app.request(
      `/api/materials/${sandboxMaterial.id}`,
      { method: "DELETE", headers: adminHeaders },
      env,
    );
    expect(del.status).toBe(204);
    expect(env.getR2(SOURCE_R2)).toBe("pdf-bytes");
  });

  it("cloneUserGraph throws and leaves no partial when over card limit", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    env.seedUser({
      id: "sandbox-tmp",
      email: "sandbox+tmp@sandbox.invalid",
      password_hash: null,
      oauth_subject: null,
      created_at: NOW,
      sandbox_of: "u-alice",
    });

    const db = getDb(env);
    await expect(
      cloneUserGraph(db, env, "u-alice", "sandbox-tmp", { maxCards: 0 }),
    ).rejects.toBeInstanceOf(CloneLimitExceededError);

    expect(
      env.getDecks().filter((d) => d.user_id === "sandbox-tmp"),
    ).toHaveLength(0);
  });

  it("startImpersonation deletes sandbox user when atlas clone fails", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    const packR2 = "atlas/atlas-alice/pack-fail.txt";
    env.seedAtlas({
      id: "atlas-alice",
      user_id: "u-alice",
      template_key: "parasite",
      created_at: NOW,
    });
    env.seedAtlasMaterial({
      id: "pack-fail",
      atlas_id: "atlas-alice",
      kind: "paste",
      r2_key: packR2,
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: NOW,
      content_hash: "pack-fail-hash",
      source_role: "tutorial",
    });
    env.seedR2(packR2, "pack body");

    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = ((sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.includes("INSERT INTO atlas_materials")) {
        return {
          bind() {
            return this;
          },
          async run() {
            throw new Error("forced failure during atlas materials insert");
          },
          async first() {
            throw new Error("forced failure during atlas materials insert");
          },
          async all() {
            throw new Error("forced failure during atlas materials insert");
          },
        };
      }
      return realPrepare(sql);
    }) as typeof env.DB.prepare;

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBeGreaterThanOrEqual(500);

    expect(
      env.getUsers().filter((u) => u.sandbox_of === "u-alice"),
    ).toHaveLength(0);

    expect(env.getR2Keys().filter((k) => k.startsWith("sandbox/"))).toEqual([]);
    expect(env.getR2(packR2)).toBe("pack body");
  });
});
