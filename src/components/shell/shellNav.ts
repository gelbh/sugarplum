import type { ReactNode } from "react";

/** Mobile / drawer shell tab ids. Admin is drawer-only (never BottomChrome). */
export type ShellNavId =
  "today" | "insights" | "library" | "achievements" | "settings" | "admin";

export type ShellNavItem = {
  id: ShellNavId;
  label: string;
  href: string;
  icon: ReactNode;
};
