import type { ReactNode } from "react";
import Badge from "@mui/material/Badge";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Paper from "@mui/material/Paper";
import type { ShellGenerationKind } from "../../shell/resolveShellGenerationStatus";
import {
  BOTTOM_NAV_HEIGHT,
  PLUM_ON_DARK,
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  SHELL_MUTED,
} from "./chromeTokens";
import type { ShellNavId } from "./shellNav";

export type BottomChromeItem = {
  id: ShellNavId;
  label: string;
  href: string;
  icon: ReactNode;
};

type BottomChromeProps = {
  active: ShellNavId;
  items: BottomChromeItem[];
  onNavigate: (href: string) => void;
  /** Secondary cue on Library when generation chrome is active. */
  libraryBadgeKind?: ShellGenerationKind | null;
};

const BADGE_COLOR: Record<ShellGenerationKind, string> = {
  generating: PLUM_ON_DARK,
  drafts_ready: "#A5D6A7",
  failed: "#E57373",
};

function libraryAria(
  label: string,
  kind: ShellGenerationKind | null | undefined,
): string {
  if (!kind) return label;
  if (kind === "drafts_ready") return `${label}, drafts ready`;
  if (kind === "failed") return `${label}, generation failed`;
  return `${label}, generating`;
}

/** Fixed mobile bottom dock; safe-area inset is padding inside the Paper. */
export default function BottomChrome({
  active,
  items,
  onNavigate,
  libraryBadgeKind = null,
}: BottomChromeProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        bgcolor: SHELL_BG,
        color: SHELL_FG,
        borderTop: `1px solid ${SHELL_HAIRLINE}`,
        backgroundImage: "none",
        borderRadius: 0,
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <BottomNavigation
        showLabels
        value={active}
        onChange={(_e, value: ShellNavId) => {
          const item = items.find((n) => n.id === value);
          if (item) onNavigate(item.href);
        }}
        sx={{
          bgcolor: "transparent",
          height: BOTTOM_NAV_HEIGHT,
          minHeight: BOTTOM_NAV_HEIGHT,
          "& .MuiBottomNavigationAction-root": {
            color: SHELL_MUTED,
            minWidth: 0,
            "&.Mui-selected": {
              color: SHELL_FG,
            },
          },
          "& .MuiBottomNavigationAction-label": {
            fontSize: "0.7rem",
            "&.Mui-selected": {
              fontSize: "0.7rem",
            },
          },
        }}
      >
        {items.map((item) => {
          const isLibrary = item.id === "library";
          const showBadge = isLibrary && libraryBadgeKind != null;
          const icon = showBadge ? (
            <Badge
              variant="dot"
              overlap="circular"
              sx={{
                "& .MuiBadge-badge": {
                  bgcolor: BADGE_COLOR[libraryBadgeKind],
                  boxShadow: `0 0 0 2px ${SHELL_BG}`,
                },
              }}
            >
              {item.icon}
            </Badge>
          ) : (
            item.icon
          );
          return (
            <BottomNavigationAction
              key={item.id}
              label={item.label}
              value={item.id}
              icon={icon}
              aria-label={
                isLibrary
                  ? libraryAria(item.label, libraryBadgeKind)
                  : undefined
              }
              sx={{
                "&.Mui-selected": {
                  borderTop: `2px solid ${PLUM_ON_DARK}`,
                },
              }}
            />
          );
        })}
      </BottomNavigation>
    </Paper>
  );
}
