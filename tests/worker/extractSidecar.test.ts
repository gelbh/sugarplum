import { describe, expect, it } from "vitest";
import {
  extractSidecarKey,
  getExtractSidecar,
  putExtractSidecar,
  deleteExtractSidecar,
} from "../../worker/generation/extractSidecar";
import { createTestEnv } from "./test-env";

describe("extractSidecar", () => {
  it("uses a stable R2 key per job", () => {
    expect(extractSidecarKey("job-1")).toBe("generation-extract/job-1.json");
  });

  it("round-trips text, window resume, and drafts", async () => {
    const env = createTestEnv();
    const drafts = [
      {
        type: "qa" as const,
        front: "What is mitochondria?",
        back: "Powerhouse of the cell.",
        provenance: { pages: [1], excerpt: "Mitochondria are" },
      },
    ];
    await putExtractSidecar(env, "job-a", {
      text: "Mitochondria are the powerhouse.",
      windowResume: {
        used_keys: ["p1"],
        next_page: 3,
        total_pages: 10,
      },
      drafts,
    });

    const loaded = await getExtractSidecar(env, "job-a");
    expect(loaded?.text).toBe("Mitochondria are the powerhouse.");
    expect(loaded?.windowResume?.total_pages).toBe(10);
    expect(loaded?.drafts).toEqual(drafts);

    await deleteExtractSidecar(env, "job-a");
    expect(await getExtractSidecar(env, "job-a")).toBeNull();
  });
});
