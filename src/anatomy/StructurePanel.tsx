import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import FilterCenterFocusIcon from "@mui/icons-material/FilterCenterFocus";
import type { AnatomyRegion, AnatomyStructure } from "./types";
import type { StructureUiAction, StructureUiState } from "./structureState";

type Props = {
  structures: AnatomyStructure[];
  regions?: AnatomyRegion[];
  activeRegions: Set<string>;
  onToggleRegion: (regionId: string) => void;
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
};

export default function StructurePanel({
  structures,
  regions,
  activeRegions,
  onToggleRegion,
  ui,
  dispatch,
}: Props) {
  const [q, setQ] = useState("");
  const visibleStructures = useMemo(() => {
    if (!regions?.length) return structures;
    return structures.filter(
      (s) => s.region != null && activeRegions.has(s.region),
    );
  }, [structures, regions, activeRegions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return visibleStructures;
    return visibleStructures.filter((s) =>
      s.label.toLowerCase().includes(needle),
    );
  }, [visibleStructures, q]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: { md: 240 },
        maxWidth: { md: 280 },
        width: "100%",
      }}
    >
      {regions && regions.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" component="h2" sx={{ mb: 0.5 }}>
            Regions
          </Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
            {regions.map((r) => {
              const on = activeRegions.has(r.id);
              return (
                <Chip
                  key={r.id}
                  size="small"
                  label={r.label}
                  color={on ? "primary" : "default"}
                  variant={on ? "filled" : "outlined"}
                  onClick={() => onToggleRegion(r.id)}
                  aria-pressed={on}
                />
              );
            })}
          </Stack>
        </Box>
      ) : null}
      <Typography variant="subtitle2" component="h2">
        Structures
      </Typography>
      <TextField
        size="small"
        label="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Button
        size="small"
        variant="outlined"
        onClick={() => dispatch({ type: "showAll" })}
      >
        Show all
      </Button>
      {regions && regions.length > 0 && visibleStructures.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Enable a region to load structures.
        </Typography>
      ) : null}
      <List dense disablePadding sx={{ overflow: "auto", flex: 1 }}>
        {filtered.map((s) => {
          const hidden = ui.hidden.has(s.id);
          const isolated = ui.isolatedId === s.id;
          return (
            <ListItemButton
              key={s.id}
              selected={ui.selectedId === s.id}
              onClick={() => dispatch({ type: "select", id: s.id })}
              sx={{ borderRadius: 1, mb: 0.25 }}
            >
              <ListItemText
                primary={s.label}
                secondary={
                  isolated ? "isolated" : hidden ? "hidden" : undefined
                }
              />
              <Stack direction="row" spacing={0}>
                <IconButton
                  size="small"
                  aria-label={hidden ? `Show ${s.label}` : `Hide ${s.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "toggleHidden", id: s.id });
                  }}
                >
                  {hidden ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Isolate ${s.label}`}
                  color={isolated ? "primary" : "default"}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(
                      isolated
                        ? { type: "clearIsolate" }
                        : { type: "isolate", id: s.id },
                    );
                  }}
                >
                  <FilterCenterFocusIcon fontSize="small" />
                </IconButton>
              </Stack>
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
