/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUEST_FLAG_KEY } from "../../src/guest/session";
import {
  postSessionHint,
  resetSessionSyncForTests,
  SESSION_SYNC_CHANNEL,
  subscribeSessionSync,
} from "../../src/session/sessionSync";

afterEach(() => {
  resetSessionSyncForTests();
  vi.restoreAllMocks();
});

async function awaitWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms),
    ),
  ]);
}

describe("sessionSync", () => {
  it("postSessionHint sends type session without user fields", async () => {
    if (typeof BroadcastChannel === "undefined") {
      expect(() => postSessionHint()).not.toThrow();
      return;
    }
    const peer = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    const got = new Promise<unknown>((resolve) => {
      peer.addEventListener("message", (event) => resolve(event.data), {
        once: true,
      });
    });
    postSessionHint();
    const hint = (await awaitWithTimeout(
      got,
      1000,
      "session hint",
    )) as { type: string; ts: number; user?: unknown };
    expect(hint.type).toBe("session");
    expect(typeof hint.ts).toBe("number");
    expect(hint.user).toBeUndefined();
    peer.close();
  });

  it("subscribeSessionSync invokes onHint for BroadcastChannel message", async () => {
    if (typeof BroadcastChannel === "undefined") return;
    const onHint = vi.fn();
    const unsub = subscribeSessionSync(onHint);
    const peer = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    const got = new Promise<void>((resolve) => {
      onHint.mockImplementation(() => resolve());
    });
    peer.postMessage({ type: "session", ts: 1 });
    await awaitWithTimeout(got, 1000, "session subscribe");
    expect(onHint).toHaveBeenCalledTimes(1);
    peer.close();
    unsub();
  });

  it("subscribeSessionSync invokes onHint for guest flag storage events", () => {
    const onHint = vi.fn();
    const unsub = subscribeSessionSync(onHint);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: GUEST_FLAG_KEY,
        newValue: "1",
        oldValue: null,
      }),
    );
    expect(onHint).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "other-key",
        newValue: "1",
        oldValue: null,
      }),
    );
    expect(onHint).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("postSessionHint is a noop when BroadcastChannel is missing", () => {
    resetSessionSyncForTests();
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error deliberate delete for noop path
    delete globalThis.BroadcastChannel;
    expect(() => postSessionHint()).not.toThrow();
    globalThis.BroadcastChannel = original;
    resetSessionSyncForTests();
  });
});
