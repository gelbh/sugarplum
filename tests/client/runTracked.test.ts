import { describe, expect, it, vi } from "vitest";
import { runTracked } from "../../src/progress/runTracked";
import type { ProgressSnapshot } from "../../src/progress/types";

function mockRegistry() {
  const upsert = vi.fn();
  const complete = vi.fn();
  const fail = vi.fn();
  return { upsert, complete, fail };
}

describe("runTracked", () => {
  it("upserts indeterminate, completes on success, and returns the result", async () => {
    const registry = mockRegistry();
    const result = await runTracked(registry, "op-1", async () => "ok", {
      label: "Working…",
    });

    expect(result).toBe("ok");
    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "op-1",
        label: "Working…",
        mode: "indeterminate",
        percent: 0,
        source: "client",
      } satisfies Partial<ProgressSnapshot>),
    );
    expect(registry.complete).toHaveBeenCalledWith("op-1");
    expect(registry.fail).not.toHaveBeenCalled();
  });

  it("reports determinate percent via setPercent and completes on success", async () => {
    const registry = mockRegistry();
    await runTracked(
      registry,
      "upload-1",
      async ({ setPercent }) => {
        setPercent(40);
        setPercent(90);
        return 1;
      },
      { label: "Uploading file", mode: "determinate" },
    );

    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "upload-1",
        mode: "determinate",
        percent: 0,
      }),
    );
    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 40, mode: "determinate" }),
    );
    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 90, mode: "determinate" }),
    );
    expect(registry.complete).toHaveBeenCalledWith("upload-1");
    expect(registry.fail).not.toHaveBeenCalled();
  });

  it("fails the op and rethrows when the work throws", async () => {
    const registry = mockRegistry();
    await expect(
      runTracked(
        registry,
        "op-fail",
        async () => {
          throw new Error("boom");
        },
        { label: "Working…" },
      ),
    ).rejects.toThrow("boom");

    expect(registry.fail).toHaveBeenCalledWith("op-fail");
    expect(registry.complete).not.toHaveBeenCalled();
  });

  it("ignores setPercent after settle so late callbacks cannot resurrect the op", async () => {
    const registry = mockRegistry();
    let lateSetPercent: ((n: number) => void) | undefined;

    await runTracked(
      registry,
      "upload-late",
      async ({ setPercent }) => {
        setPercent(50);
        lateSetPercent = setPercent;
        return "done";
      },
      { label: "Uploading file", mode: "determinate" },
    );

    const callsAfterComplete = registry.upsert.mock.calls.length;
    lateSetPercent?.(99);
    expect(registry.upsert.mock.calls.length).toBe(callsAfterComplete);
    expect(registry.complete).toHaveBeenCalledWith("upload-late");
  });
});
