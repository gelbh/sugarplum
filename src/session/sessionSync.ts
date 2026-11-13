import { GUEST_FLAG_KEY } from "../guest/session";

export const SESSION_SYNC_CHANNEL = "sugarplum-session";

export type SessionSyncHint = {
  type: "session";
  ts: number;
};

type ChannelLike = {
  postMessage: (data: SessionSyncHint) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<SessionSyncHint>) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<SessionSyncHint>) => void,
  ) => void;
  close: () => void;
};

/** Auth.js-shaped: one channel; undefined until first use; null if unavailable. */
let sharedChannel: ChannelLike | null | undefined;

function getChannel(): ChannelLike | null {
  if (sharedChannel !== undefined) return sharedChannel;
  if (typeof BroadcastChannel === "undefined") {
    sharedChannel = null;
    return null;
  }
  try {
    sharedChannel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
  } catch {
    sharedChannel = null;
  }
  return sharedChannel;
}

/** Hint-only; never include user or token. Noop when BC missing. */
export function postSessionHint(): void {
  getChannel()?.postMessage({ type: "session", ts: Date.now() });
}

/**
 * Listen for peer auth settle (BroadcastChannel) and guest-flag localStorage
 * changes. Invokes onHint; caller should force-refresh session.
 */
export function subscribeSessionSync(onHint: () => void): () => void {
  const channel = getChannel();
  const onMessage = (event: MessageEvent<SessionSyncHint>) => {
    if (event.data?.type !== "session") return;
    onHint();
  };
  channel?.addEventListener("message", onMessage);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== GUEST_FLAG_KEY) return;
    onHint();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
  };
}

/** Test helper: reset singleton between cases. */
export function resetSessionSyncForTests(): void {
  if (sharedChannel) {
    try {
      sharedChannel.close();
    } catch {
      /* ignore */
    }
  }
  sharedChannel = undefined;
}
