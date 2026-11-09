import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/guest/session", () => ({
  isGuest: () => false,
}));

const getStatus = vi.fn();
const getCsv = vi.fn();
const putWeights = vi.fn();

vi.mock("../../src/api/client", () => ({
  getFsrsOptimizeStatus: () => getStatus(),
  getFsrsRevlogCsv: () => getCsv(),
  putFsrsWeights: (w: number[]) => putWeights(w),
}));

vi.mock("../../src/study/fsrsOptimize.worker?worker", () => {
  class FakeWorker {
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((err: ErrorEvent) => void) | null = null;
    postMessage(_msg: unknown) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { ok: true, w: Array.from({ length: 21 }, () => 0.4) },
        } as MessageEvent);
      });
    }
    terminate() {}
  }
  return { default: FakeWorker };
});

describe("maybeRunFsrsOptimize", () => {
  beforeEach(async () => {
    vi.resetModules();
    getStatus.mockReset();
    getCsv.mockReset();
    putWeights.mockReset();
    const mod = await import("../../src/study/fsrsOptimizeClient");
    mod.resetFsrsOptimizeClientGuardsForTests();
  });

  it("no-ops when not pending", async () => {
    getStatus.mockResolvedValue({
      pending: false,
      lastOptimizedAt: null,
      reviewCount: 10,
      hasCustomW: false,
      eligible: false,
    });
    const { maybeRunFsrsOptimize } = await import(
      "../../src/study/fsrsOptimizeClient"
    );
    expect(await maybeRunFsrsOptimize()).toBe("skipped");
    expect(getCsv).not.toHaveBeenCalled();
  });

  it("does not start a second train while one is in flight", async () => {
    let resolveStatus: (v: unknown) => void = () => {};
    getStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );
    getCsv.mockResolvedValue("card_id,review_time,review_rating,review_duration,review_state\n");
    putWeights.mockResolvedValue({ ok: true, wLength: 21 });

    const { maybeRunFsrsOptimize } = await import(
      "../../src/study/fsrsOptimizeClient"
    );
    const first = maybeRunFsrsOptimize();
    const second = maybeRunFsrsOptimize();
    expect(await second).toBe("skipped");
    resolveStatus({
      pending: true,
      lastOptimizedAt: null,
      reviewCount: 500,
      hasCustomW: false,
      eligible: true,
    });
    expect(await first).toBe("ran");
    expect(putWeights).toHaveBeenCalledOnce();
  });
});
