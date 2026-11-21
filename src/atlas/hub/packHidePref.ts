import { useCallback, useState } from "react";

const key = (userId: string) => `sugarplum.atlas.showHidden.${userId}`;

export function readShowHiddenPref(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeShowHiddenPref(userId: string, on: boolean): void {
  try {
    localStorage.setItem(key(userId), on ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts for this visit only */
  }
}

/** Show hidden, re-read whenever the user key changes. */
export function useShowHiddenPref(
  userKey: string,
): [boolean, (on: boolean) => void] {
  const [pref, setPref] = useState(() => ({
    key: userKey,
    on: readShowHiddenPref(userKey),
  }));
  const on = pref.key === userKey ? pref.on : readShowHiddenPref(userKey);
  const set = useCallback(
    (next: boolean) => {
      setPref({ key: userKey, on: next });
      writeShowHiddenPref(userKey, next);
    },
    [userKey],
  );
  return [on, set];
}
