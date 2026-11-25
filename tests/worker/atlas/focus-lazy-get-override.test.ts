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


describe("atlas focus empty materials and lazy GET", () => {
  it("keeps override rows when scannable materials become empty", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

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
        headers: focusAuthHeaders(true),
        body: JSON.stringify({ override: "key" }),
      },
      env,
    );
    expect(pin.status).toBe(200);

    const del = await app.request(
      `/api/atlas/materials/${material.id}`,
      {
        method: "DELETE",
        headers: focusAuthHeaders(),
      },
      env,
    );
    expect(del.status).toBe(204);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
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
        headers: focusAuthHeaders(true),
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
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const res = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: focusAuthHeaders(true),
        body: "null",
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
