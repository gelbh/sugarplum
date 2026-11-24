import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  createFocusAtlas,
  focusAuthHeaders,
  pasteAtlasPack,
  resetTestDb,
  seedAtlasMaterial,
  seedDeck,
  seedFocusOwner,
  seedMaterial,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  enrichEntriesWithFocus,
  focusRefreshLeaseActive,
  listEntriesWithFocus,
  refreshAtlasFocus,
  setFocusOverride,
} from "../../../worker/atlas/focus";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import { overlayAtlas } from "../../../worker/atlas/merge";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import type { AtlasEntryView } from "../../../src/atlas/types";
import type { Env } from "../../../worker/env";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("atlas focus persistence helpers", () => {
  it("GET shows override even when refresh never rewrote tier", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Intro to flukes",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
    });
    expect(paste.status).toBe(201);

    await setFocusOverride(env.DB, atlasId, "fasciola-hepatica", "standard");

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
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
      { headers: focusAuthHeaders() },
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
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

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
      { headers: focusAuthHeaders() },
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
        personalNote: null,
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
      true,
    );
    expect(enriched[0]).toMatchObject({
      tier: "frequent",
      reason: "Manual demote",
      override: "frequent",
      focusMaterialIds: [],
    });
  });
});
