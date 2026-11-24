import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  resetTestDb,
  seedGuestImportOwner,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("POST /api/guest/import", () => {
  it("imports cloze with multiple blanks", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Cloze deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "cloze",
              front: "{{c1::one}} and {{c2::two}}",
              back: "",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await getCards(env))).toHaveLength(1);
    expect((await getCards(env))[0]?.type).toBe("cloze");
  });

  it("imports cloze with empty back", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Cloze deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "cloze",
              front: "Water moves by {{c1::osmosis}}",
              back: "",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const cards = (await getCards(env));
    expect(cards[0].type).toBe("cloze");
    expect(cards[0].back_json).toBe(JSON.stringify(""));
  });

  it("imports mcq with validated options", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "MCQ deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "mcq",
              front: "Pick one",
              back: "B",
              options: ["A", "B", "C"],
              source: "hub",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const cards = (await getCards(env));
    expect(cards[0].type).toBe("mcq");
    expect(JSON.parse(cards[0].back_json!)).toEqual({
      answer: "B",
      options: ["A", "B", "C"],
    });
  });

  it("returns 400 for mcq without valid options", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Bad MCQ",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "mcq",
              front: "Pick",
              back: "X",
              options: ["A", "B"],
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getCards(env))).toHaveLength(0);
  });
});
