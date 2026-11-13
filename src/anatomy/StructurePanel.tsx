import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import type { AnatomyStructure } from "./types";
import type { StructureUiAction, StructureUiState } from "./structureState";

type Props = {
  structures: AnatomyStructure[];
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
};

export default function StructurePanel({ structures, ui, dispatch }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return structures;
    return structures.filter((s) => s.label.toLowerCase().includes(needle));
  }, [structures, q]);

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
