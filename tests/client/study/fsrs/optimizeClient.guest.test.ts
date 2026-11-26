import { beforeEach, describe, expect, it, vi } from "vitest";
import { enterGuest } from "../../../../src/guest/session";
import {
  clearGuestStore,
  ensureGuestStore,
  guestGetFsrsOptimizeStatus,
} from "../../../../src/guest/store";
import { FSRS_MIN_REVIEWS } from "../../../../src/study/fsrs/fsrsOptimizeConstants";

vi.mock("../../../../src/guest/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/guest/session")>();
  return {
    ...actual,
    isGuest: () => true,
  };
});

vi.mock("../../../../src/study/fsrs/fsrsOptimize.worker?worker", () => {
  class FakeWorker {
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((err: ErrorEvent) => void) | null = null;
    postMessage(_msg: unknown) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { ok: true, w: Array.from({ length: 34 }, () => 0.4) },
        } as MessageEvent);
      });
    }
    terminate() {}
  }
  return { default: FakeWorker };
});

const STORE_KEY = "sugarplum.guest.store.v1";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

describe("guest maybeRunFsrsOptimize", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(async () => {
    vi.resetModules();
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    clearGuestStore(storage);
    enterGuest(storage);
    ensureGuestStore(storage);
    const mod = await import("../../../../src/study/fsrs/fsrsOptimizeClient");
    mod.resetFsrsOptimizeClientGuardsForTests();
  });

  it("trains when enriched floor met and never optimized", async () => {
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      reviewLogs: Array<{
        cardId: string;
        rating: number;
        at: string;
        state?: number;
      }>;
      fsrsOptimizePending?: boolean;
    };
    raw.reviewLogs = Array.from({ length: FSRS_MIN_REVIEWS }, (_, i) => ({
      cardId: `c${i}`,
      rating: 3,
      at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
      state: 0,
    }));
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    const { maybeRunFsrsOptimize } = await import(
      "../../../../src/study/fsrs/fsrsOptimizeClient"
    );
    expect(await maybeRunFsrsOptimize()).toBe("ran");
    expect(guestGetFsrsOptimizeStatus(storage).hasCustomW).toBe(true);
    expect(guestGetFsrsOptimizeStatus(storage).pending).toBe(false);
  });

  it("skips when below floor", async () => {
    const { maybeRunFsrsOptimize } = await import(
      "../../../../src/study/fsrs/fsrsOptimizeClient"
    );
    expect(await maybeRunFsrsOptimize()).toBe("skipped");
  });

  it("runFsrsOptimizeTrainNow saves guest weights", async () => {
    ensureGuestStore(storage);
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      reviewLogs: Array<{
        cardId: string;
        rating: number;
        at: string;
        state?: number;
      }>;
    };
    raw.reviewLogs = Array.from({ length: FSRS_MIN_REVIEWS }, (_, i) => ({
      cardId: `c${i}`,
      rating: 3,
      at: `2026-02-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
      state: 0,
    }));
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    const { runFsrsOptimizeTrainNow } = await import(
      "../../../../src/study/fsrs/fsrsOptimizeClient"
    );
    await runFsrsOptimizeTrainNow();
    const status = guestGetFsrsOptimizeStatus(storage);
    expect(status.hasCustomW).toBe(true);
    expect(status.lastOptimizedAt).not.toBeNull();
  });
});
