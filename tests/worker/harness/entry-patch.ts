import { expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { AtlasEntryView } from "../../../src/atlas/types";
import { seedSession, seedUser } from "./seed";
import type { Bindings } from "./types";

export const ENTRY_PATCH_TS = "2026-02-01T00:00:00.000Z";

export async function seedEntryPatchOwner(env: Bindings): Promise<void> {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

export function entryPatchAuthHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export async function createEntryPatchAtlas(env: Bindings): Promise<string> {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: entryPatchAuthHeaders() },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

export function patchEntry(
  env: Bindings,
  atlasId: string,
  entryId: string,
  body: unknown,
) {
  return app.request(
    `/api/atlas/${atlasId}/entries/${entryId}`,
    {
      method: "PATCH",
      headers: entryPatchAuthHeaders(true),
      body: JSON.stringify(body),
    },
    env,
  );
}

export async function listEntries(
  env: Bindings,
  atlasId: string,
): Promise<AtlasEntryView[]> {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries`,
    { headers: entryPatchAuthHeaders() },
    env,
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: AtlasEntryView[] }).entries;
}

export async function createLearnerEntry(
  env: Bindings,
  atlasId: string,
  canonicalName: string,
): Promise<AtlasEntryView> {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries`,
    {
      method: "POST",
      headers: entryPatchAuthHeaders(true),
      body: JSON.stringify({
        canonicalName,
        commonName: "Imaginary worm",
        fields: { group: "nematode" },
      }),
    },
    env,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as AtlasEntryView;
}

/** Legacy rows omit the 0042 columns; override rows list them last. */
export async function seedOverlayRow(
  env: Bindings,
  atlasId: string,
  opts: {
    id: string;
    originKey: string;
    fieldsJson: string;
    overridesJson?: string;
    updatedAt?: string;
  },
) {
  const dataset = loadParasiteDataset().entries.find(
    (e) => e.key === opts.originKey,
  ) ?? { canonicalName: `Retiredus ${opts.id}`, commonName: null };
  const updatedAt = opts.updatedAt ?? ENTRY_PATCH_TS;
  if (opts.overridesJson === undefined) {
    await env.DB.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(
        opts.id,
        atlasId,
        dataset.canonicalName,
        dataset.commonName,
        opts.fieldsJson,
        ENTRY_PATCH_TS,
        updatedAt,
        opts.originKey,
        1,
        ENTRY_PATCH_TS,
      )
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO atlas_entries (
       id, atlas_id, canonical_name, common_name, fields_json, status,
       created_at, updated_at, origin_key, origin_version, edited_at, deleted_at,
       field_overrides_json, aliases_json
     ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      opts.id,
      atlasId,
      dataset.canonicalName,
      dataset.commonName,
      opts.fieldsJson,
      ENTRY_PATCH_TS,
      updatedAt,
      opts.originKey,
      1,
      ENTRY_PATCH_TS,
      null,
      opts.overridesJson,
      null,
    )
    .run();
}

export async function rawRow(env: Bindings, id: string) {
  return env.DB.prepare("SELECT * FROM atlas_entries WHERE id = ?")
    .bind(id)
    .first<{
      fields_json: string;
      field_overrides_json: string | null;
      common_name: string | null;
    }>();
}

export function datasetEntry(key: string) {
  return loadParasiteDataset().entries.find((e) => e.key === key)!;
}
