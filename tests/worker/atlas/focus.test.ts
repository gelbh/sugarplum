import { describe, expect, it } from "vitest";
import {
  enrichEntriesWithFocus,
  listEntriesWithFocus,
  refreshAtlasFocus,
  setFocusOverride,
} from "../../../worker/atlas/focus";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites";
import { overlayAtlas } from "../../../worker/atlas/merge";
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

async function createAtlas(
  env: ReturnType<typeof createTestEnv>,
): Promise<string> {
  const created = await app.request(
    "/api/atlas",
    { method: "POST", headers: authHeaders() },
    env,
  );
  expect(created.status).toBe(201);
  const atlas = (await created.json()) as { id: string };
  return atlas.id;
}

async function pasteAtlasPack(
  env: ReturnType<typeof createTestEnv>,
  atlasId: string,
  opts: { text: string; filename: string; source_role?: string },
) {
  return app.request(
    `/api/atlas/${atlasId}/materials/paste`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(opts),
    },
    env,
  );
}

describe("atlas focus persistence helpers", () => {
  it("GET shows override even when refresh never rewrote tier", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Intro to flukes",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
    });
    expect(paste.status).toBe(201);

    await setFocusOverride(env.DB, atlasId, "fasciola-hepatica", "standard");

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

    await setFocusOverride(env.DB, atlasId, "fasciola-hepatica", null);
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
    const atlasId = await createAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Intro to flukes",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
    });
    expect(paste.status).toBe(201);

    await env.DB.prepare(
      `DELETE FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
    )
      .bind(atlasId, "giardia-duodenalis")
      .run();

    const focusBefore = await env.DB.prepare(
      `SELECT entry_key FROM atlas_entry_focus WHERE atlas_id = ?`,
    )
      .bind(atlasId)
      .all<{ entry_key: string }>();
    const keysBefore = new Set(
      (focusBefore.results ?? []).map((r) => r.entry_key),
    );
    expect(keysBefore.size).toBeGreaterThan(0);
    expect(keysBefore.has("giardia-duodenalis")).toBe(false);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
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
      .bind(atlasId, "giardia-duodenalis")
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
              normalized.includes("FROM atlas_materials") &&
              normalized.includes("WHERE atlas_id =")
            ) {
              return {
                results: [
                  {
                    id: "m1",
                    atlas_id: "a1",
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
        override: null,
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
      override: "frequent",
      focusMaterialIds: [],
    });
  });
});

describe("atlas focus empty materials and lazy GET", () => {
  it("keeps override rows when scannable materials become empty", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Intro",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
    });
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

    const del = await app.request(`/api/atlas/materials/${material.id}`, {
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
      override: "key",
    });

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
      override: "standard",
    });
  });

  it("rejects a null JSON body on focus PATCH", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

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

  it("lazy-refreshes Focus on GET when cache is empty but ready pack materials exist", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    env.seedAtlasMaterial({
      id: "mat-pre",
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: `atlas/${atlasId}/mat-pre.pdf`,
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      content_hash: null,
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

  it("clears stale automatic Focus on GET when the pack is empty", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const now = "2026-01-01T00:00:00.000Z";

    await env.DB.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "fasciola-hepatica",
        "key",
        'Named in lecture "old-deck.pdf"',
        '["deck-mat-1"]',
        null,
        now,
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "toxoplasma-gondii",
        "standard",
        "Standard",
        "[]",
        "key",
        now,
      )
      .run();

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
      tier: null,
      reason: null,
      override: null,
    });
    expect(
      body.entries.find((e) => e.id === "toxoplasma-gondii"),
    ).toMatchObject({
      tier: "key",
      reason: "Manual pin",
      override: "key",
    });
  });

  it("ignores non-ready pack materials during Focus refresh", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    env.seedAtlasMaterial({
      id: "mat-uploading",
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: `atlas/${atlasId}/mat-uploading.pdf`,
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
      content_hash: null,
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

  it("schedules pack Focus refresh when schedule is provided", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica named late in the handout.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    const warm = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(warm.status).toBe(200);

    await env.DB.prepare(
      `INSERT OR REPLACE INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "fasciola-hepatica",
        "standard",
        "Standard",
        "[]",
        null,
        "2026-01-01T00:00:00.000Z",
      )
      .run();
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind(null, atlasId)
      .run();

    const merged = overlayAtlas(loadParasiteDataset().entries, []);
    let scheduled: Promise<unknown> | null = null;
    const first = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
      schedule: (p) => {
        scheduled = p;
      },
    });
    expect(first.focusRefreshPending).toBe(true);
    expect(
      first.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("standard");
    const lease = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string | null }>();
    expect(lease?.focus_pack_fingerprint).toMatch(/^refreshing:/);
    expect(scheduled).not.toBeNull();

    const mid = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
      schedule: () => {
        throw new Error("must not schedule again while leased");
      },
    });
    expect(mid.focusRefreshPending).toBe(true);

    await scheduled!;

    const second = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
    });
    expect(second.focusRefreshPending).toBe(false);
    expect(
      second.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("rescans complete Focus map when pack fingerprint is missing or stale", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica named late in the handout.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    const warm = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(warm.status).toBe(200);
    const warmBody = (await warm.json()) as { entries: AtlasEntryView[] };
    expect(
      warmBody.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({ tier: "key" });

    const fpRow = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string | null }>();
    expect(fpRow?.focus_pack_fingerprint).toMatch(/^v1:/);

    await env.DB.prepare(
      `INSERT OR REPLACE INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "fasciola-hepatica",
        "standard",
        "Standard",
        "[]",
        null,
        "2026-01-01T00:00:00.000Z",
      )
      .run();

    const matchedFp = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(matchedFp.status).toBe(200);
    const matchedBody = (await matchedFp.json()) as {
      entries: AtlasEntryView[];
    };
    expect(
      matchedBody.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("standard");

    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind(null, atlasId)
      .run();

    const healed = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(healed.status).toBe(200);
    const healedBody = (await healed.json()) as { entries: AtlasEntryView[] };
    expect(
      healedBody.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("deck-only ready materials do not Key; atlas pack paste can", async () => {
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
    const atlasId = await createAtlas(env);

    env.seedMaterial({
      id: "deck-mat",
      deck_id: "deck-1",
      kind: "pdf",
      r2_key: "materials/deck-1/deck-mat.pdf",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "tutorial",
    });

    const listDeckOnly = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(listDeckOnly.status).toBe(200);
    const deckOnly = (await listDeckOnly.json()) as {
      entries: AtlasEntryView[];
    };
    expect(
      deckOnly.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBeNull();

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica appears on page 1 of this tutorial.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    const listPack = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: authHeaders() },
      env,
    );
    expect(listPack.status).toBe(200);
    const withPack = (await listPack.json()) as { entries: AtlasEntryView[] };
    expect(
      withPack.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });
});
