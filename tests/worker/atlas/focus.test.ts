import { describe, expect, it } from "vitest";
import {
  enrichEntriesWithFocus,
  refreshAtlasFocus,
  setFocusOverride,
} from "../../../worker/atlas/focus";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { createTestEnv } from "../test-env";
import type { AtlasEntryView } from "../../../src/atlas/types";
import type { Env } from "../../../worker/env";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
  env.seedSubject({
    id: "sub-1",
    user_id: "user-a",
    title: "Parasitology",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

function authHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

describe("atlas focus persistence helpers", () => {
  it("GET shows override even when refresh never rewrote tier", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const created = await app.request(
      "/api/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(created.status).toBe(201);
    const atlas = (await created.json()) as { id: string };
    const atlasId = atlas.id;

    const paste = await app.request(
      "/api/decks/deck-1/materials/paste",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Intro to flukes",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);

    // Simulate setFocusOverride without a following refresh: demote while
    // leaving cached scan tier as key.
    await setFocusOverride(env.DB, atlas.id, "fasciola-hepatica", "standard");

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const fasciola = body.entries.find((e) => e.id === "fasciola-hepatica");
    expect(fasciola).toMatchObject({
      tier: "standard",
      reason: "Manual demote",
    });

    // Clear override without refresh: pure scan tier must resurface.
    await setFocusOverride(env.DB, atlas.id, "fasciola-hepatica", null);
    const cleared = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    const clearedBody = (await cleared.json()) as { entries: AtlasEntryView[] };
    expect(
      clearedBody.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("heals partial null focus when materials exist", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const created = await app.request(
      "/api/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(created.status).toBe(201);
    const atlas = (await created.json()) as { id: string };

    const paste = await app.request(
      "/api/decks/deck-1/materials/paste",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Intro to flukes",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);

    // Leave a partial map: one missing row while others remain (legacy sparse).
    await env.DB.prepare(
      `DELETE FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
    )
      .bind(atlas.id, "giardia-duodenalis")
      .run();

    const focusBefore = await env.DB.prepare(
      `SELECT entry_key FROM atlas_entry_focus WHERE atlas_id = ?`,
    )
      .bind(atlas.id)
      .all<{ entry_key: string }>();
    const keysBefore = new Set(
      (focusBefore.results ?? []).map((r) => r.entry_key),
    );
    expect(keysBefore.size).toBeGreaterThan(0);
    expect(keysBefore.has("giardia-duodenalis")).toBe(false);

    const list = await app.request(
      `/api/atlas/${atlas.id}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const giardia = body.entries.find((e) => e.id === "giardia-duodenalis");
    expect(giardia?.tier).not.toBeNull();
    expect(body.entries.every((e) => e.tier !== null)).toBe(true);

    const healedRow = await env.DB.prepare(
      `SELECT tier FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
    )
      .bind(atlas.id, "giardia-duodenalis")
      .first<{ tier: string }>();
    expect(healedRow?.tier).toBeTruthy();
  });

  it("refresh upserts before deleting stale keys (no wipe-first blank window)", async () => {
    const statements: string[] = [];
    const focus = new Map<
      string,
      {
        atlas_id: string;
        entry_key: string;
        tier: string;
        reason: string;
        material_ids_json: string;
        override: string | null;
        updated_at: string;
      }
    >();
    focus.set("stale-key", {
      atlas_id: "a1",
      entry_key: "stale-key",
      tier: "standard",
      reason: "Standard",
      material_ids_json: "[]",
      override: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const db = {
      prepare(sql: string) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        let bound: unknown[] = [];
        const stmt = {
          bind(...args: unknown[]) {
            bound = args;
            return stmt;
          },
          async first<T>() {
            if (normalized.startsWith("SELECT id, user_id FROM atlases")) {
              return { id: "a1", user_id: "u1" } as T;
            }
            if (
              normalized.includes("FROM atlas_entry_focus") &&
              normalized.includes("AND entry_key =")
            ) {
              return null;
            }
            return null;
          },
          async all<T>() {
            if (
              normalized.includes("FROM materials m") &&
              normalized.includes("d.user_id")
            ) {
              return {
                results: [
                  {
                    id: "m1",
                    deck_id: "d1",
                    kind: "paste",
                    r2_key: null,
                    filename: "notes.pdf",
                    source_role: "lecture",
                    status: "ready",
                  },
                ] as T[],
              };
            }
            if (
              normalized.includes("FROM atlas_entry_focus WHERE atlas_id =") &&
              !normalized.includes("AND entry_key")
            ) {
              return { results: [...focus.values()] as T[] };
            }
            if (normalized.includes("FROM atlas_entries WHERE atlas_id =")) {
              return { results: [] as T[] };
            }
            return { results: [] as T[] };
          },
          async run() {
            statements.push(normalized);
            if (
              normalized.startsWith("INSERT OR REPLACE INTO atlas_entry_focus")
            ) {
              const [
                atlas_id,
                entry_key,
                tier,
                reason,
                material_ids_json,
                override,
                updated_at,
              ] = bound as [
                string,
                string,
                string,
                string,
                string,
                string | null,
                string,
              ];
              focus.set(entry_key, {
                atlas_id,
                entry_key,
                tier,
                reason,
                material_ids_json,
                override,
                updated_at,
              });
            }
            if (
              normalized.includes("DELETE FROM atlas_entry_focus") &&
              normalized.includes("AND entry_key =")
            ) {
              focus.delete(bound[1] as string);
            }
            return { success: true, meta: { changes: 1 } };
          },
        };
        return stmt;
      },
    } as unknown as D1Database;

    const env = {
      MATERIALS: {
        async get() {
          return null;
        },
      },
    } as unknown as Env;

    await refreshAtlasFocus(db, env, { atlasId: "a1" });

    const firstDelete = statements.findIndex((s) =>
      s.includes("DELETE FROM atlas_entry_focus"),
    );
    const firstUpsert = statements.findIndex((s) =>
      s.startsWith("INSERT OR REPLACE INTO atlas_entry_focus"),
    );
    expect(firstUpsert).toBeGreaterThanOrEqual(0);
    expect(firstDelete).toBeGreaterThan(firstUpsert);
    expect(
      statements.some((s) =>
        /^DELETE FROM atlas_entry_focus WHERE atlas_id = \?$/.test(s),
      ),
    ).toBe(false);

    // Mid-flight invariant: after first upsert, map is never empty while
    // stale rows still exist or new rows are present.
    expect(focus.has("stale-key")).toBe(false);
    expect(focus.size).toBeGreaterThan(0);
  });
});

describe("enrichEntriesWithFocus override", () => {
  it("wins over a stale cached scan tier", () => {
    const entries = [
      {
        id: "fasciola-hepatica",
        originKey: "fasciola-hepatica",
        canonicalName: "Fasciola hepatica",
        commonName: null,
        aliases: [],
        fields: {} as AtlasEntryView["fields"],
        refs: [],
        images: [],
        editedAt: null,
        tier: null,
        reason: null,
        focusMaterialIds: [],
      },
    ];
    const enriched = enrichEntriesWithFocus(
      entries,
      new Map([
        [
          "fasciola-hepatica",
          {
            tier: "key",
            reason: 'Named in tutorial "x.pdf"',
            override: "frequent",
            materialIds: ["mat-1"],
          },
        ],
      ]),
    );
    expect(enriched[0]).toMatchObject({
      tier: "frequent",
      reason: "Manual demote",
      focusMaterialIds: [],
    });
  });
});

describe("atlas focus empty materials and lazy GET", () => {
  it("keeps override rows when scannable materials become empty", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const created = await app.request(
      "/api/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(created.status).toBe(201);
    const atlas = (await created.json()) as { id: string };
    const atlasId = atlas.id;

    const paste = await app.request(
      "/api/decks/deck-1/materials/paste",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Intro",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);
    const material = (await paste.json()) as { id: string };

    const pin = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ override: "key" }),
      },
      env,
    );
    expect(pin.status).toBe(200);

    const del = await app.request(`/api/materials/${material.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }, env);
    expect(del.status).toBe(204);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: "Manual pin",
    });

    // Focus PATCH must stick even with no materials left.
    const demote = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ override: "standard" }),
      },
      env,
    );
    expect(demote.status).toBe(200);
    expect(await demote.json()).toMatchObject({
      tier: "standard",
      reason: "Manual demote",
    });
  });

  it("rejects a null JSON body on focus PATCH", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const created = await app.request(
      "/api/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(created.status).toBe(201);
    const { id: atlasId } = (await created.json()) as { id: string };

    const res = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: "null",
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("lazy-refreshes Focus on GET when cache is empty but ready materials exist", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const created = await app.request(
      "/api/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(created.status).toBe(201);
    const { id: atlasId } = (await created.json()) as { id: string };

    // Seed after atlas create so focus cache stays empty until GET.
    env.seedMaterial({
      id: "mat-pre",
      deck_id: "deck-1",
      kind: "pdf",
      r2_key: "materials/deck-1/mat-pre.pdf",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "tutorial",
    });

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("ignores non-ready materials during Focus refresh", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const created = await app.request(
      "/api/atlas",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(created.status).toBe(201);
    const { id: atlasId } = (await created.json()) as { id: string };
    env.seedMaterial({
      id: "mat-uploading",
      deck_id: "deck-1",
      kind: "pdf",
      r2_key: "materials/deck-1/mat-uploading.pdf",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "tutorial",
    });

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBeNull();
  });
});
