import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARD_REGEN_QUEUE_MAX_RETRIES,
  CARD_REGEN_QUEUE_RETRY_DELAY_SEC,
} from "../../worker/generation/card-regen-op";
import {
  EXPORT_QUEUE_MAX_RETRIES,
  EXPORT_QUEUE_RETRY_DELAY_SEC,
} from "../../worker/export/stale";
import {
  GENERATE_QUEUE_MAX_RETRIES,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  RUNNING_JOB_STALE_MS,
} from "../../worker/generation/progress";

const wrangler = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

describe("wrangler queue sync (Node)", () => {
  it("keeps sugarplum-generate retry budget in sync with RUNNING_JOB_STALE_MS", () => {
    expect(wrangler).toContain(`"max_retries": ${GENERATE_QUEUE_MAX_RETRIES}`);
    expect(wrangler).toContain(
      `"retry_delay": ${GENERATE_QUEUE_RETRY_DELAY_SEC}`,
    );
    expect(
      GENERATE_QUEUE_MAX_RETRIES * GENERATE_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("keeps sugarplum-card-regen retry budget in sync and omits max_concurrency", () => {
    expect(wrangler).toContain(`"max_retries": ${CARD_REGEN_QUEUE_MAX_RETRIES}`);
    expect(wrangler).toContain(
      `"retry_delay": ${CARD_REGEN_QUEUE_RETRY_DELAY_SEC}`,
    );
    const consumer = wrangler.match(
      new RegExp(
        `\\{\\s*"queue": "sugarplum-card-regen",[\\s\\S]*?"retry_delay": ${CARD_REGEN_QUEUE_RETRY_DELAY_SEC}\\s*,?\\s*\\}`,
      ),
    )?.[0];
    expect(consumer).toBeTruthy();
    expect(consumer).not.toMatch(/"max_concurrency"/);
    expect(
      CARD_REGEN_QUEUE_MAX_RETRIES * CARD_REGEN_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("keeps sugarplum-export max_retries in sync with retry delay", () => {
    expect(wrangler).toContain(`"max_retries": ${EXPORT_QUEUE_MAX_RETRIES}`);
    expect(wrangler).toContain(
      `"retry_delay": ${EXPORT_QUEUE_RETRY_DELAY_SEC}`,
    );
  });
});
