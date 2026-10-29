import { describe, expect, it, vi } from "vitest";
import { handleExportQueue } from "../../worker/export/consumer";
import type { ExportQueueMessage } from "../../worker/export/enqueue";
import { createTestEnv } from "./test-env";

const user = {
  id: "user-a",
  email: "a@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function mockBatch(messages: ExportQueueMessage[]) {
  return {
    queue: "sugarplum-export",
    messages: messages.map((body) => ({
      body,
      ack: vi.fn(),
      retry: vi.fn(),
    })),
  } as unknown as MessageBatch<ExportQueueMessage>;
}

describe("handleExportQueue", () => {
  it("builds a queued export to ready with R2 object", async () => {
    const env = createTestEnv();
    env.seedUser(user);
    env.seedSubject({
      id: "subject-a",
      user_id: user.id,
      title: "Anatomy",
      created_at: user.created_at,
    });
    env.seedDeck({
      id: "deck-a",
      user_id: user.id,
      title: "Bones",
      subject_hint: null,
      subject_id: "subject-a",
      created_at: user.created_at,
    });
    env.seedCard({
      id: "card-a",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("What is the femur?"),
      back_json: JSON.stringify("The thigh bone"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: user.created_at,
      updated_at: user.created_at,
    });

    const exportId = "export-async-1";
    const r2Key = `exports/${user.id}/${exportId}.apkg`;
    const createdAt = user.created_at;
    const expiresAt = "2099-01-01T00:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO export_jobs
       (id, user_id, status, request_json, r2_key, error, warning_json,
        created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
      .bind(
        exportId,
        user.id,
        "queued",
        JSON.stringify({ type: "deck", deckId: "deck-a" }),
        r2Key,
        JSON.stringify({ missingMedia: 0, skippedCards: 0 }),
        createdAt,
        createdAt,
        expiresAt,
      )
      .run();

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);

    const job = env.getExportJobs().find((row) => row.id === exportId);
    expect(job?.status).toBe("ready");
    expect(job?.r2_key).toBe(r2Key);
    expect(env.getR2(r2Key)).toBeDefined();
    expect(batch.messages[0]?.ack).toHaveBeenCalled();
    expect(batch.messages[0]?.retry).not.toHaveBeenCalled();
  });

  it("acks and skips jobs that are not queued", async () => {
    const env = createTestEnv();
    env.seedUser(user);
    const exportId = "export-ready-1";
    await env.DB.prepare(
      `INSERT INTO export_jobs
       (id, user_id, status, request_json, r2_key, error, warning_json,
        created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
      .bind(
        exportId,
        user.id,
        "ready",
        JSON.stringify({ type: "deck", deckId: "deck-a" }),
        `exports/${user.id}/${exportId}.apkg`,
        JSON.stringify({ missingMedia: 0, skippedCards: 0 }),
        user.created_at,
        user.created_at,
        "2099-01-01T00:00:00.000Z",
      )
      .run();

    const batch = mockBatch([{ exportId }]);
    await handleExportQueue(batch, env);
    expect(batch.messages[0]?.ack).toHaveBeenCalled();
    expect(env.getExportJobs()[0]?.status).toBe("ready");
  });
});
