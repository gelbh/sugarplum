import { describe, expect, it, vi } from "vitest";
import { mapPoolSettled } from "../../src/anatomy/viewer/anatomyCanvasLoad";

describe("mapPoolSettled", () => {
  it("settles all items and reports onItemDone per item", async () => {
    const onItemDone = vi.fn();
    const results = await mapPoolSettled(
      [1, 2, 3],
      2,
      async (n) => n * 10,
      onItemDone,
    );
    expect(onItemDone).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
      { status: "fulfilled", value: 30 },
    ]);
  });

  it("captures rejections without aborting siblings", async () => {
    const results = await mapPoolSettled(
      ["ok", "bad", "ok2"],
      2,
      async (key) => {
        if (key === "bad") throw new Error("boom");
        return key;
      },
      () => {},
    );
    expect(results[0]).toEqual({ status: "fulfilled", value: "ok" });
    expect(results[1]?.status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: "ok2" });
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    await mapPoolSettled(
      [1, 2, 3, 4, 5],
      2,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active -= 1;
      },
      () => {},
    );
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
