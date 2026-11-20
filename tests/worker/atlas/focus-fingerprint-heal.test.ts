import { describe, expect, it } from "vitest";
import { listEntriesWithFocus } from "../../../worker/atlas/focus";
import { focusPackFingerprint } from "../../../worker/atlas/atlas-materials";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import { overlayAtlas } from "../../../worker/atlas/merge";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { createTestEnv } from "../test-env";

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

describe("focus pack fingerprint role heal", () => {
  it("heals Key on GET when fingerprint is stale after source_role change", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const paste = await app.request(
      `/api/atlas/${atlasId}/materials/paste`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Fasciola hepatica named in the pack.",
          filename: "Week2_named.pdf",
          source_role: "lecture",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);
    const pasted = (await paste.json()) as { id: string };
    const row = env.getAtlasMaterials().find((m) => m.id === pasted.id);
    expect(row).toBeTruthy();

    const merged = overlayAtlas(loadParasiteDataset().entries, []);
    const before = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
    });
    expect(
      before.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("standard");

    await env.DB.prepare(
      "UPDATE atlas_materials SET source_role = ? WHERE id = ?",
    )
      .bind("tutorial", pasted.id)
      .run();

    // Simulate failed best-effort refresh: leave a pre-role fingerprint.
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind(
        focusPackFingerprint([
          {
            id: row!.id,
            content_hash: row!.content_hash ?? null,
            source_role: "lecture",
          },
        ]),
        atlasId,
      )
      .run();

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

    const healed = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
    });
    expect(healed.focusRefreshPending).toBe(false);
    expect(
      healed.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });
});
