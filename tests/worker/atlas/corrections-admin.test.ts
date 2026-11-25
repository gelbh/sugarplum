import { env as cfEnv } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { UPSERT_OPEN_SUGGESTION_SQL } from "../../../worker/atlas/corrections";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import {
  adminList,
  adminResolve,
  editAndSuggest,
  listEntries,
  openRows,
  resetTestDb,
  seedAdmin,
  studentSetup,
} from "./corrections-route-helpers";

const T0 = "2026-11-20T00:00:00.000Z";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

function psoroptes() {
  return loadParasiteDataset().entries.find((e) => e.key === "psoroptes-ovis")!;
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
