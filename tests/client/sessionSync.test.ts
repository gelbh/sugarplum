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

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("sessionSync", () => {
  it("postSessionHint sends type session without user fields", async () => {
    if (typeof BroadcastChannel === "undefined") {
      expect(() => postSessionHint()).not.toThrow();
      return;
    }
    const received: unknown[] = [];
    const peer = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    peer.addEventListener("message", (event) => {
      received.push(event.data);
    });
    postSessionHint();
    await flush();
    expect(received).toHaveLength(1);
    const hint = received[0] as { type: string; ts: number; user?: unknown };
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
    peer.postMessage({ type: "session", ts: 1 });
    await flush();
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
