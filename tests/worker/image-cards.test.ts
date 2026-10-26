import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { mockLlmAdapter } from "../../worker/generation/llm";
import { parseCardDrafts } from "../../worker/generation/schema";
import { createTestEnv } from "./test-env";

describe("image / diagram card drafts", () => {
  it("parses image_label and diagram drafts", () => {
    const drafts = parseCardDrafts([
      {
        type: "image_label",
        front: "Name the labelled structure",
        back: "Femur",
        provenance: { pages: [1], excerpt: "labelled bone" },
      },
      {
        type: "diagram",
        front: "What sits superior to the labelled structure?",
        back: "Pelvis",
        provenance: { pages: [1], excerpt: "spatial relation" },
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.type).toBe("image_label");
    expect(drafts[1]?.type).toBe("diagram");
  });

  it("mock vision path returns image card types", async () => {
    const drafts = await mockLlmAdapter().generateDrafts({
      text: "",
      apiKey: "x",
      provider: "mock",
      image: { mimeType: "image/png", base64: "AAAA" },
    });
    expect(drafts.every((d) => d.type === "image_label" || d.type === "diagram")).toBe(
      true,
    );
  });

  it("serves owned media and 404s for others", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "A",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img.png",
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2("materials/deck-a/mat-img.png", "fakepng");
    env.seedSession("sess-a", "user-a");
    env.seedSession("sess-b", "user-b");

    const ok = await app.request(
      "/api/materials/media?key=materials%2Fdeck-a%2Fmat-img.png",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(await ok.text()).toBe("fakepng");

    const denied = await app.request(
      "/api/materials/media?key=materials%2Fdeck-a%2Fmat-img.png",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(denied.status).toBe(404);
  });

  it("accepts image upload-url metadata", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "A",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "fig.png",
          contentType: "image/png",
          size: 512,
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(env.getMaterials()[0]?.kind).toBe("image");
  });
});
