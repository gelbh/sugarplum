import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
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
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("draft review / accept gate", () => {
  it("due query skips drafts", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const pastDue = "2020-01-01T00:00:00.000Z";
    env.seedCard({
      id: "card-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Draft Q?"),
      back_json: JSON.stringify("Draft A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-accepted",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Accepted Q?"),
      back_json: JSON.stringify("Accepted A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "card-accepted",
      due: pastDue,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });

    const res = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe("card-accepted");
  });

  it("accept creates schedule and leaves drafts out of due", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-draft",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const acceptRes = await app.request(
      "/api/cards/card-draft/accept",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(acceptRes.status).toBe(200);

    const card = env.getCards().find((c) => c.id === "card-draft");
    expect(card?.status).toBe("accepted");
    const schedules = env.getSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.card_id).toBe("card-draft");
    expect(schedules[0]!.due).toBeTruthy();

    const dueRes = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(dueRes.status).toBe(200);
    const due = (await dueRes.json()) as { id: string }[];
    expect(due.some((c) => c.id === "card-draft")).toBe(true);
  });

  it("patch preserves image_label type", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-img",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "image_label",
      front_json: JSON.stringify("Label the aorta"),
      back_json: JSON.stringify("Aorta"),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/m1.png"]),
      provenance_json: JSON.stringify({ pages: [], excerpt: "fig" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-img",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          front: "Label the aortic arch",
          back: "Aortic arch",
          type: "image_label",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; front: string };
    expect(body.type).toBe("image_label");
    expect(body.front).toBe("Label the aortic arch");
    expect(env.getCards().find((c) => c.id === "card-img")?.type).toBe(
      "image_label",
    );
  });

  it("accept-all accepts every draft for the job and schedules them", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await env.DB.prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "job-bulk",
        "mat-1",
        "needs_review",
        null,
        null,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:01:00.000Z",
      )
      .run();

    for (const id of ["d1", "d2"]) {
      env.seedCard({
        id,
        deck_id: "deck-a",
        job_id: "job-bulk",
        type: "qa",
        front_json: JSON.stringify(`${id}?`),
        back_json: JSON.stringify("A"),
        media_r2_keys_json: null,
        provenance_json: JSON.stringify({ pages: [1], excerpt: id }),
        status: "draft",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
    }

    const res = await app.request(
      "/api/jobs/job-bulk/drafts/accept-all",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; failed: number };
    expect(body).toEqual({ accepted: 2, failed: 0 });
    expect(env.getCards().every((c) => c.status === "accepted")).toBe(true);
    expect(env.getSchedules()).toHaveLength(2);
  });

  it("accept-all returns 404 for another user", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await env.DB.prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "job-bulk",
        "mat-1",
        "needs_review",
        null,
        null,
        "2026-01-01T00:00:00.000Z",
        null,
      )
      .run();

    const res = await app.request(
      "/api/jobs/job-bulk/drafts/accept-all",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
  });
});
