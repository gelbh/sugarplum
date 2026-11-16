import FilterCenterFocusIcon from "@mui/icons-material/FilterCenterFocus";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { StructureUiAction, StructureUiState } from "./structureState";
import type { AnatomyStructure } from "./types";

export function StructureRow({
  structure: s,
  ui,
  dispatch,
  displayLabel,
  labelMasked,
}: {
  structure: AnatomyStructure;
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
  displayLabel: string;
  labelMasked: boolean;
}) {
  const hidden = ui.hidden.has(s.id);
  const isolated = ui.isolatedId === s.id;
  const selected = ui.selectedId === s.id;
  const nameForAria = labelMasked ? "structure" : s.label;
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => dispatch({ type: "select", id: s.id })}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          dispatch({ type: "select", id: s.id });
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        minHeight: 30,
        px: 0.75,
        py: 0.2,
        borderRadius: 1,
        cursor: "pointer",
        bgcolor: selected ? "action.selected" : "transparent",
        borderLeft: 2,
        borderColor: selected ? "primary.main" : "transparent",
        opacity: hidden ? 0.4 : 1,
        transition:
          "background-color 140ms ease-out, border-color 140ms ease-out, opacity 140ms ease-out",
        "&:hover": {
          bgcolor: selected ? "action.selected" : "action.hover",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 1,
        },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: "0.8125rem",
          fontWeight: selected ? 600 : 400,
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontStyle: labelMasked ? "italic" : "normal",
          color: labelMasked ? "text.secondary" : "text.primary",
        }}
      >
        {displayLabel}
      </Typography>
      {isolated ? (
        <Typography
          variant="caption"
          color="primary"
          sx={{ flexShrink: 0, fontSize: "0.65rem" }}
        >
          solo
        </Typography>
      ) : null}
      <IconButton
        size="small"
        aria-label={hidden ? `Show ${nameForAria}` : `Hide ${nameForAria}`}
        onClick={(ev) => {
          ev.stopPropagation();
          dispatch({ type: "toggleHidden", id: s.id });
        }}
        sx={{ p: 0.35 }}
      >
        {hidden ? (
          <VisibilityOffIcon sx={{ fontSize: 16 }} />
        ) : (
          <VisibilityIcon sx={{ fontSize: 16 }} />
        )}
      </IconButton>
      <IconButton
        size="small"
        aria-label={`Isolate ${nameForAria}`}
        color={isolated ? "primary" : "default"}
        onClick={(ev) => {
          ev.stopPropagation();
          dispatch(
            isolated ? { type: "clearIsolate" } : { type: "isolate", id: s.id },
          );
        }}
        sx={{ p: 0.35 }}
      >
        <FilterCenterFocusIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}
