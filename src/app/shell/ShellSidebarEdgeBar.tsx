import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import { DRAWER_WIDTH, RAIL_WIDTH, SHELL_FG } from "./chromeTokens";

export const SHELL_SIDEBAR_DRAG_MIN = RAIL_WIDTH;
export const SHELL_SIDEBAR_DRAG_MAX = 280;
export const SHELL_SIDEBAR_SNAP_MID = (RAIL_WIDTH + DRAWER_WIDTH) / 2;

type Props = {
  sideWidth: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onDragWidth: (width: number | null) => void;
};

function clampWidth(value: number) {
  return Math.min(
    SHELL_SIDEBAR_DRAG_MAX,
    Math.max(SHELL_SIDEBAR_DRAG_MIN, Math.round(value)),
  );
}

export default function ShellSidebarEdgeBar({
  sideWidth,
  collapsed,
  onCollapsedChange,
  onDragWidth,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previous;
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  function finishDrag(clientX: number) {
    const width = clampWidth(clientX);
    onCollapsedChange(width < SHELL_SIDEBAR_SNAP_MID);
    onDragWidth(null);
    setDragging(false);
    dragRef.current = null;
  }

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={sideWidth}
      aria-valuemin={SHELL_SIDEBAR_DRAG_MIN}
      aria-valuemax={SHELL_SIDEBAR_DRAG_MAX}
      onPointerDown={(ev) => {
        if (ev.button !== 0) return;
        const target = ev.target as HTMLElement;
        if (target.closest("button")) return;
        ev.preventDefault();
        ev.currentTarget.setPointerCapture(ev.pointerId);
        dragRef.current = { pointerId: ev.pointerId };
        setDragging(true);
        onDragWidth(clampWidth(ev.clientX));
      }}
      onPointerMove={(ev) => {
        if (!dragRef.current || dragRef.current.pointerId !== ev.pointerId) {
          return;
        }
        onDragWidth(clampWidth(ev.clientX));
      }}
      onPointerUp={(ev) => {
        if (!dragRef.current || dragRef.current.pointerId !== ev.pointerId) {
          return;
        }
        finishDrag(ev.clientX);
      }}
      onPointerCancel={(ev) => {
        if (!dragRef.current || dragRef.current.pointerId !== ev.pointerId) {
          return;
        }
        finishDrag(ev.clientX);
      }}
      sx={{
        position: "fixed",
        top: 0,
        left: sideWidth - 4,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        width: 8,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "col-resize",
        touchAction: "none",
        // Invisible hit target stays wider than the 0.5px hairline.
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: 1,
          transform: "translateX(-50%) scaleX(0.5)",
          transformOrigin: "center",
          bgcolor: dragging
            ? "rgba(209, 163, 226, 0.45)"
            : "rgba(232, 216, 199, 0.14)",
          transition: "background-color 120ms ease, opacity 120ms ease",
          opacity: dragging ? 1 : 0.55,
        },
        "&:hover::before": {
          bgcolor: "rgba(209, 163, 226, 0.4)",
          opacity: 0.9,
        },
      }}
    >
      <IconButton
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => onCollapsedChange(!collapsed)}
        size="small"
        sx={{
          position: "relative",
          zIndex: 1,
          color: "rgba(245, 245, 245, 0.38)",
          width: 22,
          height: 36,
          borderRadius: 1,
          border: "1px solid transparent",
          bgcolor: "transparent",
          opacity: dragging ? 1 : 0.72,
          "&:hover": {
            color: SHELL_FG,
            opacity: 1,
            bgcolor: "rgba(91, 44, 111, 0.28)",
            borderColor: "rgba(232, 216, 199, 0.18)",
          },
        }}
      >
        {collapsed ? (
          <KeyboardDoubleArrowRightIcon sx={{ fontSize: 16 }} />
        ) : (
          <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 16 }} />
        )}
      </IconButton>
    </Box>
  );
}
