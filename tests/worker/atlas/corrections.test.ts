import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedSubject,
  seedUser,
  withTestBindings,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  UPSERT_OPEN_SUGGESTION_SQL,
  computeCorrectionDiff,
  mergeSuggestionDiff,
  parseSuggestionBody,
  type CurrentEntryState,
} from "../../../worker/atlas/corrections";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { ParasiteFields } from "../../../worker/atlas/templates/parasite";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import type { AtlasEntryView } from "../../../src/atlas/types";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const T0 = "2026-11-20T00:00:00.000Z";
const T1 = "2026-11-20T00:01:00.000Z";

function psoroptes() {
  return loadParasiteDataset().entries.find((e) => e.key === "psoroptes-ovis")!;
}

function stored(
  overrides: Partial<ParasiteFields> = {},
  learnerAliases: string[] = [],
): CurrentEntryState {
  const base = psoroptes();
  return {
    commonName: base.commonName,
    fields: { ...(base.fields as ParasiteFields), ...overrides },
    learnerAliases,
  };
}

describe("computeCorrectionDiff", () => {
  it("diffs only the selected keys, using stored values", () => {
    const base = psoroptes();
    const current = stored({ significance: "Causes sheep scab.", majorOrgan: "back" });
    expect(computeCorrectionDiff(base, current, ["significance"])).toEqual({
      significance: { from: base.fields.significance, to: "Causes sheep scab." },
    });
  });

  it("drops a selected key whose stored value equals the dataset", () => {
    const base = psoroptes();
    expect(computeCorrectionDiff(base, stored(), ["zoonotic"])).toEqual({});
  });

  it("diffs the common name and treats null as the dataset name", () => {
    const base = psoroptes();
    expect(
      computeCorrectionDiff(base, { ...stored(), commonName: "Scab mite" }, ["commonName"]),
    ).toEqual({ commonName: { from: base.commonName, to: "Scab mite" } });
    expect(
      computeCorrectionDiff(base, { ...stored(), commonName: null }, ["commonName"]),
    ).toEqual({});
  });

  it("treats stored learner aliases as additions to the dataset aliases", () => {
    const base = psoroptes();
    expect(computeCorrectionDiff(base, stored({}, ["Scab mite"]), ["aliases"])).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
    expect(computeCorrectionDiff(base, stored({}, []), ["aliases"])).toEqual({});
  });

  it("dedupes learner aliases the way the entry view does", () => {
    const base = psoroptes();
    expect(
      computeCorrectionDiff(base, stored({}, ["Scab mite", "scab-mite", " x "]), ["aliases"]),
    ).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
  });

  it("compares objects by value, not key order", () => {
    const base = psoroptes();
    const withPpp = { ...base, fields: { ...base.fields, pppDays: { min: 10, max: 14 } } };
    expect(
      computeCorrectionDiff(
        withPpp,
        {
          ...stored(),
          fields: { ...(withPpp.fields as ParasiteFields), pppDays: { max: 14, min: 10 } },
        },
        ["pppDays"],
      ),
    ).toEqual({});
  });
});

describe("mergeSuggestionDiff", () => {
  it("adds this save's keys and keeps earlier suggested keys", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: base.fields.significance, to: "Earlier" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ significance: "Earlier", majorOrgan: "back" }), [
        "majorOrgan",
      ]),
    ).toEqual({
      significance: { from: base.fields.significance, to: "Earlier" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
  });

  it("revalues earlier keys from current storage and the current dataset", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: "stale dataset", to: "Earlier" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ significance: "Later", majorOrgan: "back" }), [
        "majorOrgan",
      ]),
    ).toEqual({
      significance: { from: base.fields.significance, to: "Later" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
  });

  it("reads a malformed stored diff as empty", () => {
    const base = psoroptes();
    for (const bad of ["not json", "[1]", "null"]) {
      expect(
        mergeSuggestionDiff(bad, base, stored({ majorOrgan: "back" }), ["majorOrgan"]),
      ).toEqual({ majorOrgan: { from: base.fields.majorOrgan, to: "back" } });
    }
  });

  it("removes earlier keys whose stored value is back to the dataset", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: base.fields.significance, to: "Earlier" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ majorOrgan: "back" }), ["significance"]),
    ).toEqual({ majorOrgan: { from: base.fields.majorOrgan, to: "back" } });
  });
});

describe("parseSuggestionBody", () => {
  it("selects keys from the patch and trims note and link", () => {
    expect(
      parseSuggestionBody({
        patch: {
          fields: { significance: "x", notAField: 1 },
          commonName: "Scab mite",
          aliases: ["Scab mite"],
          canonicalName: "Psoroptes ovis",
        },
        note: "  per WOAH  ",
        sourceUrl: " https://example.org/scab ",
      }),
    ).toEqual({
      keys: ["significance", "commonName", "aliases"],
      canonicalName: "Psoroptes ovis",
      note: "per WOAH",
      sourceUrl: "https://example.org/scab",
    });
    expect(parseSuggestionBody({ patch: {} })).toEqual({
      keys: [],
      canonicalName: null,
      note: null,
      sourceUrl: null,
    });
  });

  it("rejects bad input", () => {
    expect(() => parseSuggestionBody({ patch: {}, note: "x".repeat(1001) })).toThrow(
      /at most 1000/,
    );
    expect(() =>
      parseSuggestionBody({ patch: {}, sourceUrl: "javascript:alert(1)" }),
    ).toThrow(/http or https/);
    expect(() =>
      parseSuggestionBody({ patch: {}, sourceUrl: "ftp://example.org/x" }),
    ).toThrow(/http or https/);
    expect(() => parseSuggestionBody({ note: "x" })).toThrow(/patch required/);
  });
});

type Env = Bindings;

async function seedStudent(env: Env) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Parasitology",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

function headers(session: string, json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=${session}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function createAtlas(env: Env): Promise<string> {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: headers("sess-a") },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

function suggest(env: Env, atlasId: string, entryId: string, body: unknown) {
  return app.request(
    `/api/atlas/${atlasId}/entries/${entryId}/suggestion`,
    { method: "POST", headers: headers("sess-a", true), body: JSON.stringify(body) },
    env,
  );
}

/** A save with the box unticked: overlay PATCH only. */
async function patchOnly(env: Env, atlasId: string, patch: Record<string, unknown>) {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries/psoroptes-ovis`,
    { method: "PATCH", headers: headers("sess-a", true), body: JSON.stringify(patch) },
    env,
  );
  expect(res.status).toBe(200);
}

/** Real client order with the box ticked: PATCH first, then the same patch. */
async function editAndSuggest(
  env: Env,
  atlasId: string,
  patch: Record<string, unknown>,
  extra: { note?: string; sourceUrl?: string } = {},
) {
  await patchOnly(env, atlasId, patch);
  return suggest(env, atlasId, "psoroptes-ovis", { patch, ...extra });
}

async function listEntries(env: Env, atlasId: string): Promise<AtlasEntryView[]> {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries`,
    { headers: headers("sess-a") },
    env,
  );
  return ((await res.json()) as { entries: AtlasEntryView[] }).entries;
}

async function studentSetup() {
  const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
  await seedStudent(env);
  const atlasId = await createAtlas(env);
  return { env, atlasId };
}

describe("POST /api/atlas/:atlasId/entries/:entryId/suggestion", () => {
  it("stores this save's diff after the personal PATCH", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    const res = await editAndSuggest(
      env,
      atlasId,
      { fields: { significance: "Causes sheep scab." } },
      { note: "Shorter wording", sourceUrl: "https://example.org/scab" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "open",
      diff: { significance: { from: base.fields.significance, to: "Causes sheep scab." } },
    });

    const entries = await listEntries(env, atlasId);
    expect(entries.find((e) => e.originKey === "psoroptes-ovis")?.suggestionStatus).toBe("open");
    expect(entries.find((e) => e.originKey === "fasciola-hepatica")?.suggestionStatus).toBeNull();
  });

  it("returns 400 when nothing is stored that differs from the dataset", async () => {
    const { env, atlasId } = await studentSetup();
    const res = await suggest(env, atlasId, "psoroptes-ovis", {
      patch: { fields: { significance: "Never saved" } },
    });
    expect(res.status).toBe(400);
  });

  it("includes stored learner aliases when the save touched aliases", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    const res = await editAndSuggest(env, atlasId, { aliases: ["Scab mite"] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { diff: object }).diff).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
  });

  it("accepts the unchanged scientific name and refuses a different one", async () => {
    const { env, atlasId } = await studentSetup();
    const same = await editAndSuggest(env, atlasId, {
      canonicalName: "Psoroptes ovis",
      fields: { significance: "New" },
    });
    expect(same.status).toBe(200);
    const renamed = await suggest(env, atlasId, "psoroptes-ovis", {
      patch: { canonicalName: "Psoroptes cuniculi", fields: { significance: "New" } },
    });
    expect(renamed.status).toBe(400);
    expect(await renamed.text()).toMatch(/add an alias instead/);
  });

  it("returns 400 for learner-added entries and 404 for unknown ones", async () => {
    const { env, atlasId } = await studentSetup();
    const created = await app.request(
      `/api/atlas/${atlasId}/entries`,
      {
        method: "POST",
        headers: headers("sess-a", true),
        body: JSON.stringify({
          canonicalName: "Madeupius fictus",
          commonName: "Custom",
          fields: { group: "nematode" },
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as AtlasEntryView;
    const learner = await suggest(env, atlasId, id, { patch: { fields: { significance: "x" } } });
    expect(learner.status).toBe(400);
    const unknown = await suggest(env, atlasId, "no-such-key", {
      patch: { fields: { significance: "x" } },
    });
    expect(unknown.status).toBe(404);
  });

  it("sends an earlier suggested key at its current stored value", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await editAndSuggest(env, atlasId, { fields: { significance: "First" } });
    await patchOnly(env, atlasId, { fields: { significance: "Second" } });
    const res = await editAndSuggest(env, atlasId, {
      fields: { majorOrgan: "skin of the back" },
    });
    expect(((await res.json()) as { diff: object }).diff).toEqual({
      significance: { from: base.fields.significance, to: "Second" },
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });

  it("merges two ticked saves into one open diff", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await editAndSuggest(env, atlasId, { fields: { significance: "New" } });
    const second = await editAndSuggest(env, atlasId, {
      fields: { majorOrgan: "skin of the back" },
    });
    expect(((await second.json()) as { diff: object }).diff).toEqual({
      significance: { from: base.fields.significance, to: "New" },
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });

  it("does not send an earlier edit saved without the box ticked", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await patchOnly(env, atlasId, { fields: { significance: "Private wording" } });
    const res = await editAndSuggest(env, atlasId, {
      fields: { majorOrgan: "skin of the back" },
    });
    expect(((await res.json()) as { diff: object }).diff).toEqual({
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });

  it("removes a key from the open diff once it is reset to the dataset", async () => {
    const { env, atlasId } = await studentSetup();
    const base = psoroptes();
    await editAndSuggest(env, atlasId, { fields: { significance: "New" } });
    await editAndSuggest(env, atlasId, { fields: { majorOrgan: "skin of the back" } });
    const reset = await editAndSuggest(env, atlasId, {
      fields: { significance: base.fields.significance },
    });
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { diff: object }).diff).toEqual({
      majorOrgan: { from: base.fields.majorOrgan, to: "skin of the back" },
    });
  });
});

async function seedAdmin(env: Env) {
  await seedUser(env, {
    id: "admin-u",
    email: "ops@example.com",
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-admin", "admin-u");
}

function adminList(env: Env, query = "?status=open", session = "sess-admin") {
  return app.request(
    `/api/admin/atlas/corrections${query}`,
    { headers: headers(session) },
    env,
  );
}

function adminResolve(env: Env, id: string, status: unknown, session = "sess-admin") {
  return app.request(
    `/api/admin/atlas/corrections/${id}`,
    { method: "POST", headers: headers(session, true), body: JSON.stringify({ status }) },
    env,
  );
}

type AdminRow = {
  id: string;
  originKey: string;
  canonicalName: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  note: string | null;
  sourceUrl: string | null;
  studentEmail: string;
};

async function openRows(env: Env): Promise<AdminRow[]> {
  const res = await adminList(env);
  expect(res.status).toBe(200);
  return ((await res.json()) as { corrections: AdminRow[] }).corrections;
}

describe("admin atlas corrections", () => {
  it("rejects non-admins on both routes", async () => {
    const { env } = await studentSetup();
    await seedAdmin(env);
    expect((await adminList(env, "?status=open", "sess-a")).status).toBe(403);
    expect((await adminResolve(env, "x", "accepted", "sess-a")).status).toBe(403);
  });

  it("lists open suggestions with parasite, diff, note, link and email", async () => {
    const { env, atlasId } = await studentSetup();
    await seedAdmin(env);
    await editAndSuggest(
      env,
      atlasId,
      { fields: { significance: "New" } },
      { note: "Per lecture", sourceUrl: "https://example.org/scab" },
    );
    const [row, ...rest] = await openRows(env);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      originKey: "psoroptes-ovis",
      canonicalName: "Psoroptes ovis",
      diff: { significance: { from: psoroptes().fields.significance, to: "New" } },
      note: "Per lecture",
      sourceUrl: "https://example.org/scab",
      studentEmail: "a@example.com",
    });
    expect((await adminList(env, "?status=bogus")).status).toBe(400);
  });

  it("accepts once, then 409; the student sees Accepted for review", async () => {
    const { env, atlasId } = await studentSetup();
    await seedAdmin(env);
    await editAndSuggest(env, atlasId, { fields: { significance: "New" } });
    const [row] = await openRows(env);

    expect((await adminResolve(env, row.id, "maybe")).status).toBe(400);
    const accepted = await adminResolve(env, row.id, "accepted");
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ id: row.id, status: "accepted" });
    expect((await adminResolve(env, row.id, "rejected")).status).toBe(409);
    expect((await adminResolve(env, "missing-id", "accepted")).status).toBe(404);

    const entries = await listEntries(env, atlasId);
    expect(entries.find((e) => e.originKey === "psoroptes-ovis")?.suggestionStatus).toBe(
      "accepted",
    );
    expect(await openRows(env)).toEqual([]);
  });

  it("lists a row with a malformed diff as an empty diff", async () => {
    const { env, atlasId } = await studentSetup();
    await seedAdmin(env);
    await env.DB.prepare(UPSERT_OPEN_SUGGESTION_SQL)
      .bind("bad-1", "user-a", atlasId, "psoroptes-ovis", 9, "not json", null, null, T0)
      .run();
    const [row] = await openRows(env);
    expect(row).toMatchObject({ id: "bad-1", diff: {} });
  });

  it("opens a fresh row after a resolved one", async () => {
    const { env, atlasId } = await studentSetup();
    await seedAdmin(env);
    await editAndSuggest(env, atlasId, { fields: { significance: "New" } });
    const [first] = await openRows(env);
    await adminResolve(env, first.id, "rejected");
    await editAndSuggest(env, atlasId, { fields: { significance: "Newer" } });
    const [second] = await openRows(env);
    expect(second.id).not.toBe(first.id);
    const entries = await listEntries(env, atlasId);
    expect(entries.find((e) => e.originKey === "psoroptes-ovis")?.suggestionStatus).toBe("open");
  });
});
