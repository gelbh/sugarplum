export const SHELL_SIDEBAR_COLLAPSED_KEY = "sugarplum.shell.sidebarCollapsed";

/** null = follow viewport default (rail on medium, drawer on large). */
export function loadShellSidebarCollapsed(
  storage?: Pick<Storage, "getItem">,
): boolean | null {
  try {
    const store = storage ?? localStorage;
    const raw = store.getItem(SHELL_SIDEBAR_COLLAPSED_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function saveShellSidebarCollapsed(
  collapsed: boolean,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    const store = storage ?? localStorage;
    store.setItem(SHELL_SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
