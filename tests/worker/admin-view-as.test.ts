import { describe, it, expect, afterEach, vi } from "vitest";
import { State } from "ts-fsrs";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  CloneLimitExceededError,
  cloneUserGraph,
} from "../../worker/admin/clone-user";
import { getDb } from "../../worker/db/client";
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
  env.seedSession("s-admin", "admin-u");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin view-as library", () => {
  it("start does not clone decks/cards; GETs read source rows", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    const deckCount = env.getDecks().length;
    const cardCount = env.getCards().length;

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    expect(env.getDecks().length).toBe(deckCount);
    expect(env.getCards().length).toBe(cardCount);
    expect(env.getUsers().filter((u) => u.sandbox_of != null)).toHaveLength(0);

    const decks = await app.request(
      "/api/decks",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(decks.status).toBe(200);
  });

  it("learner mutates return 403 and leave source unchanged", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    const frontBefore = env
      .getCards()
      .find((c) => c.id === "card-a")!.front_json;
    const scheduleBefore = {
      ...env.getSchedules().find((s) => s.card_id === "card-a")!,
    };

    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const patch = await app.request(
      "/api/cards/card-a",
      {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ front: "Edited under view-as?" }),
      },
      env,
    );
    expect(patch.status).toBe(403);
    expect(await patch.json()).toMatchObject({
      message: "Read-only while viewing as user",
      code: "VIEW_AS_READ_ONLY",
    });

    const reset = await app.request(
      "/api/cards/card-a/reset-schedule",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(reset.status).toBe(403);

    const del = await app.request(
      "/api/materials/mat-1",
      { method: "DELETE", headers: adminHeaders },
      env,
    );
    expect(del.status).toBe(403);

    expect(env.getCards().find((c) => c.id === "card-a")!.front_json).toBe(
      frontBefore,
    );
    const scheduleAfter = env
      .getSchedules()
      .find((s) => s.card_id === "card-a")!;
    expect(scheduleAfter.reps).toBe(scheduleBefore.reps);
    expect(scheduleAfter.due).toBe(scheduleBefore.due);

    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(exit.status).toBe(200);
  });

  it("Focus GET during view-as does not refresh fingerprint", async () => {
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

    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const list = await app.request(
      "/api/atlas/atlas-alice/entries",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      entries: Array<{ id: string; tier: string | null }>;
      focusRefreshPending?: boolean;
    };
    expect(listed.focusRefreshPending).toBe(false);
    expect(
      listed.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({ tier: "standard" });
    expect(
      env.getAtlases().find((a) => a.id === "atlas-alice")
        ?.focus_pack_fingerprint ?? null,
    ).toBeNull();
  });
});

describe("cloneUserGraph (legacy helper)", () => {
  it("throws and leaves no partial when over card limit", async () => {
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

  it("clones atlas_entry_notes with remapped entry_key", async () => {
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
    env.seedAtlas({
      id: "atlas-alice",
      user_id: "u-alice",
      template_key: "parasite",
      created_at: NOW,
    });
    await env.DB.prepare(
      `INSERT INTO atlas_entry_notes (atlas_id, entry_key, body, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind("atlas-alice", "fasciola-hepatica", "Remember miracidium", NOW)
      .run();

    const db = getDb(env);
    await cloneUserGraph(db, env, "u-alice", "sandbox-tmp", {
      maxCards: 10_000,
    });

    const sandboxAtlas = env
      .getAtlases()
      .find((a) => a.user_id === "sandbox-tmp");
    expect(sandboxAtlas).toBeTruthy();
    const { results } = await env.DB.prepare(
      `SELECT entry_key, body FROM atlas_entry_notes WHERE atlas_id = ?`,
    )
      .bind(sandboxAtlas!.id)
      .all<{ entry_key: string; body: string }>();
    expect(results).toHaveLength(1);
    expect(results![0]).toMatchObject({
      entry_key: "fasciola-hepatica",
      body: "Remember miracidium",
    });
  });
});
