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
  it("deck-only ready materials do not Key; atlas pack paste can", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const atlasId = await createFocusAtlas(env);

    await seedMaterial(env, {
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
      { headers: focusAuthHeaders() },
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
      { headers: focusAuthHeaders() },
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
