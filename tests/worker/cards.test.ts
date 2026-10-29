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

type TestEnv = ReturnType<typeof createTestEnv>;

async function seedNeedsReviewJob(
  env: TestEnv,
  opts: {
    jobId: string;
    materialId: string;
    deckId: string;
    cards: { id: string; status?: "draft" | "accepted" }[];
  },
) {
  env.seedMaterial({
    id: opts.materialId,
    deck_id: opts.deckId,
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
      opts.jobId,
      opts.materialId,
      "needs_review",
      null,
      null,
      "2026-01-01T00:00:00.000Z",
      null,
    )
    .run();
  for (const card of opts.cards) {
    env.seedCard({
      id: card.id,
      deck_id: opts.deckId,
      job_id: opts.jobId,
      type: "qa",
      front_json: JSON.stringify(`${card.id}?`),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: card.id }),
      status: card.status ?? "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  }
}

async function postAcceptAll(env: TestEnv, jobId: string) {
  return app.request(
    `/api/jobs/${jobId}/drafts/accept-all`,
    {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=sess-a` },
    },
    env,
  );
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
    const body = (await res.json()) as { cards: { id: string }[] };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]!.id).toBe("card-accepted");
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
    const due = (await dueRes.json()) as { cards: { id: string }[] };
    expect(due.cards.some((c) => c.id === "card-draft")).toBe(true);
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

  it("patch round-trips occlusion structured front and keeps type", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const front = {
      image_key: "materials/deck-a/m1.png",
      prompt: "Identify the hidden structure",
      regions: [
        {
          id: "r1",
          x: 0.1,
          y: 0.2,
          w: 0.3,
          h: 0.25,
          label: "Femur head",
        },
      ],
      mode: "hide_one" as const,
    };
    env.seedCard({
      id: "card-occ",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "occlusion",
      front_json: JSON.stringify(front),
      back_json: JSON.stringify({ answer: "Femur head" }),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/m1.png"]),
      provenance_json: JSON.stringify({ pages: [], excerpt: "fig" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const nextFront = {
      ...front,
      regions: [
        {
          id: "r1",
          x: 0.15,
          y: 0.22,
          w: 0.28,
          h: 0.3,
          label: "Femoral head",
        },
      ],
    };
    const res = await app.request(
      "/api/cards/card-occ",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          front: nextFront,
          back: { answer: "Femoral head" },
          type: "occlusion",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      front: typeof nextFront;
      back: { answer: string };
    };
    expect(body.type).toBe("occlusion");
    expect(body.front).toEqual(nextFront);
    expect(body.back).toEqual({ answer: "Femoral head" });

    const stored = env.getCards().find((c) => c.id === "card-occ");
    expect(stored?.type).toBe("occlusion");
    expect(JSON.parse(stored!.front_json)).toEqual(nextFront);
    expect(JSON.parse(stored!.back_json)).toEqual({ answer: "Femoral head" });
  });

  it("patch rejects occlusion with string front", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-occ-bad",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "occlusion",
      front_json: JSON.stringify({
        image_key: "materials/deck-a/m1.png",
        regions: [
          { id: "r1", x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: "A" },
        ],
        mode: "hide_one",
      }),
      back_json: JSON.stringify({ answer: "A" }),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/m1.png"]),
      provenance_json: JSON.stringify({ pages: [], excerpt: "fig" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-occ-bad",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          front: "not a structured front",
          back: { answer: "A" },
          type: "occlusion",
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
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
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({ accepted: 2, failed: 0, rejectedSiblingCount: 0 });
    expect(env.getCards().every((c) => c.status === "accepted")).toBe(true);
    expect(env.getSchedules()).toHaveLength(2);
  });

  it("accept-all rejects draft cards on other owned needs_review jobs", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await seedNeedsReviewJob(env, {
      jobId: "job-a",
      materialId: "mat-a",
      deckId: "deck-a",
      cards: [{ id: "a1" }, { id: "a2" }],
    });
    await seedNeedsReviewJob(env, {
      jobId: "job-b",
      materialId: "mat-b",
      deckId: "deck-a",
      cards: [
        { id: "b-draft" },
        { id: "b-accepted", status: "accepted" },
      ],
    });

    const res = await postAcceptAll(env, "job-a");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 2,
      failed: 0,
      rejectedSiblingCount: 1,
    });
    expect(env.getCards().find((c) => c.id === "a1")?.status).toBe("accepted");
    expect(env.getCards().find((c) => c.id === "a2")?.status).toBe("accepted");
    expect(env.getCards().find((c) => c.id === "b-draft")?.status).toBe(
      "rejected",
    );
    expect(env.getCards().find((c) => c.id === "b-accepted")?.status).toBe(
      "accepted",
    );
  });

  it("accept-all with failures leaves sibling drafts untouched", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await seedNeedsReviewJob(env, {
      jobId: "job-fail",
      materialId: "mat-a",
      deckId: "deck-a",
      cards: [{ id: "d-cas" }, { id: "d-ok" }],
    });
    await seedNeedsReviewJob(env, {
      jobId: "job-sib",
      materialId: "mat-b",
      deckId: "deck-a",
      cards: [{ id: "sib-draft" }],
    });

    const originalAll = env.DB.prepare.bind(env.DB);
    let flipped = false;
    env.DB.prepare = ((sql: string) => {
      const stmt = originalAll(sql);
      const originalAllFn = stmt.all.bind(stmt);
      stmt.all = async <T>() => {
        const out = await originalAllFn<T>();
        if (
          !flipped &&
          sql.includes("FROM cards") &&
          sql.includes("job_id =") &&
          sql.includes("status =")
        ) {
          flipped = true;
          const row = env.getCards().find((c) => c.id === "d-cas");
          if (row) {
            env.seedCard({ ...row, status: "accepted" });
          }
        }
        return out;
      };
      return stmt;
    }) as typeof env.DB.prepare;

    const res = await postAcceptAll(env, "job-fail");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    expect(env.getCards().find((c) => c.id === "sib-draft")?.status).toBe(
      "draft",
    );
  });

  it("accept-all with zero drafts does not reject siblings", async () => {
    const env = createTestEnv();
    seedOwner(env);
    await seedNeedsReviewJob(env, {
      jobId: "job-empty",
      materialId: "mat-empty",
      deckId: "deck-a",
      cards: [],
    });
    await seedNeedsReviewJob(env, {
      jobId: "job-sib",
      materialId: "mat-sib",
      deckId: "deck-a",
      cards: [{ id: "sib-draft" }],
    });

    const res = await postAcceptAll(env, "job-empty");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 0,
      failed: 0,
      rejectedSiblingCount: 0,
    });
    expect(env.getCards().find((c) => c.id === "sib-draft")?.status).toBe(
      "draft",
    );
  });

  it("accept-all does not reject another user's needs_review drafts", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Chem",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedNeedsReviewJob(env, {
      jobId: "job-mine",
      materialId: "mat-a",
      deckId: "deck-a",
      cards: [{ id: "mine-draft" }],
    });
    await seedNeedsReviewJob(env, {
      jobId: "job-other",
      materialId: "mat-other",
      deckId: "deck-b",
      cards: [{ id: "other-draft" }],
    });

    const res = await postAcceptAll(env, "job-mine");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body).toEqual({
      accepted: 1,
      failed: 0,
      rejectedSiblingCount: 0,
    });
    expect(env.getCards().find((c) => c.id === "other-draft")?.status).toBe(
      "draft",
    );
  });

  it("accept-all CAS miss does not insert a schedule or 500", async () => {
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
        "job-cas",
        "mat-1",
        "needs_review",
        null,
        null,
        "2026-01-01T00:00:00.000Z",
        null,
      )
      .run();

    env.seedCard({
      id: "d-cas",
      deck_id: "deck-a",
      job_id: "job-cas",
      type: "qa",
      front_json: JSON.stringify("Cas?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "c" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "d-ok",
      deck_id: "deck-a",
      job_id: "job-cas",
      type: "qa",
      front_json: JSON.stringify("Ok?"),
      back_json: JSON.stringify("B"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "o" }),
      status: "draft",
      created_at: "2026-01-01T00:00:01.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
    });

    // After drafts are listed, flip d-cas so UPDATE CAS misses (concurrent accept).
    const originalAll = env.DB.prepare.bind(env.DB);
    let flipped = false;
    env.DB.prepare = ((sql: string) => {
      const stmt = originalAll(sql);
      const originalAllFn = stmt.all.bind(stmt);
      stmt.all = async <T>() => {
        const out = await originalAllFn<T>();
        if (
          !flipped &&
          sql.includes("FROM cards") &&
          sql.includes("job_id =") &&
          sql.includes("status =")
        ) {
          flipped = true;
          const row = env.getCards().find((c) => c.id === "d-cas");
          if (row) {
            env.seedCard({ ...row, status: "accepted" });
          }
        }
        return out;
      };
      return stmt;
    }) as typeof env.DB.prepare;

    const res = await app.request(
      "/api/jobs/job-cas/drafts/accept-all",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    expect(env.getSchedules().map((s) => s.card_id).sort()).toEqual(["d-ok"]);
  });

  it("accept-all counts schedule races as failed without 500", async () => {
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
        "job-race",
        "mat-1",
        "needs_review",
        null,
        null,
        "2026-01-01T00:00:00.000Z",
        null,
      )
      .run();

    env.seedCard({
      id: "d-race",
      deck_id: "deck-a",
      job_id: "job-race",
      type: "qa",
      front_json: JSON.stringify("Race?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "r" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    // Pre-existing schedule: CAS update may succeed, then INSERT throws (race).
    env.seedSchedule({
      card_id: "d-race",
      due: "2020-01-01T00:00:00.000Z",
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
    env.seedCard({
      id: "d-ok",
      deck_id: "deck-a",
      job_id: "job-race",
      type: "qa",
      front_json: JSON.stringify("Ok?"),
      back_json: JSON.stringify("B"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "o" }),
      status: "draft",
      created_at: "2026-01-01T00:00:01.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-race/drafts/accept-all",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: number;
      failed: number;
      rejectedSiblingCount: number;
    };
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.rejectedSiblingCount).toBe(0);
    expect(env.getCards().find((c) => c.id === "d-ok")?.status).toBe(
      "accepted",
    );
  });

  it("lists mcq drafts with back and options", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
      id: "mat-mcq",
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
        "job-mcq",
        "mat-mcq",
        "needs_review",
        null,
        null,
        "2026-01-01T00:00:00.000Z",
        null,
      )
      .run();
    const options = ["Adenosine triphosphate", "Adenosine diphosphate", "RNA"];
    env.seedCard({
      id: "card-mcq",
      deck_id: "deck-a",
      job_id: "job-mcq",
      type: "mcq",
      front_json: JSON.stringify("What is ATP?"),
      back_json: JSON.stringify({
        answer: "Adenosine triphosphate",
        options,
      }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ATP" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-mcq/drafts",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      type: string;
      back: string;
      options: string[];
    }[];
    expect(body).toHaveLength(1);
    expect(body[0]!.type).toBe("mcq");
    expect(body[0]!.back).toBe("Adenosine triphosphate");
    expect(body[0]!.options).toEqual(options);
  });

  it("patch updates mcq correct answer and options", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const options = ["Aorta", "Vena cava", "Pulmonary artery"];
    env.seedCard({
      id: "card-mcq-patch",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "mcq",
      front_json: JSON.stringify("Which vessel carries oxygenated blood from the heart?"),
      back_json: JSON.stringify({ answer: "Aorta", options }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "aorta" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const newOptions = ["Aorta", "Vena cava", "Pulmonary vein"];
    const res = await app.request(
      "/api/cards/card-mcq-patch",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          back: "Pulmonary vein",
          options: newOptions,
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      back: string;
      options: string[];
    };
    expect(body.back).toBe("Pulmonary vein");
    expect(body.options).toEqual(newOptions);

    const stored = env.getCards().find((c) => c.id === "card-mcq-patch");
    expect(JSON.parse(stored!.back_json)).toEqual({
      answer: "Pulmonary vein",
      options: newOptions,
    });
  });

  it("patch trims mcq answer and options for exact grade match", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-mcq-trim",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "mcq",
      front_json: JSON.stringify("What is ATP?"),
      back_json: JSON.stringify({
        answer: "ATP",
        options: ["ATP", "ADP", "RNA"],
      }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ATP" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-mcq-trim",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          back: "ATP",
          options: ["ATP ", "ADP", "RNA"],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { back: string; options: string[] };
    expect(body.back).toBe("ATP");
    expect(body.options).toEqual(["ATP", "ADP", "RNA"]);
    const stored = env.getCards().find((c) => c.id === "card-mcq-trim");
    expect(JSON.parse(stored!.back_json)).toEqual({
      answer: "ATP",
      options: ["ATP", "ADP", "RNA"],
    });
  });

  it("accept rejects invalid mcq drafts", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-mcq-bad",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "mcq",
      front_json: JSON.stringify("Broken MCQ?"),
      back_json: JSON.stringify({
        answer: "Only two",
        options: ["Only two", "Options"],
      }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "x" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-mcq-bad/accept",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(env.getCards().find((c) => c.id === "card-mcq-bad")!.status).toBe(
      "draft",
    );
  });

  it("patch qa card keeps string back_json", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-qa",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("Original A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-qa",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ front: "Updated Q?" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const stored = env.getCards().find((c) => c.id === "card-qa");
    expect(stored!.back_json).toBe(JSON.stringify("Original A"));
  });

  it("patch cloze allows empty Extra back", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-cloze-extra",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "cloze",
      front_json: JSON.stringify("The {{c1::mitochondria}} is the powerhouse."),
      back_json: JSON.stringify("old extra"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-cloze-extra",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ back: "" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const stored = env.getCards().find((c) => c.id === "card-cloze-extra");
    expect(stored!.back_json).toBe(JSON.stringify(""));
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
