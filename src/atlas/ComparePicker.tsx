import { useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListSubheader from "@mui/material/ListSubheader";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import { entryTitles } from "./entryTitles";
import { browseSections, matchesSearch } from "./filter";
import type { AtlasEntryView } from "./types";
import { shouldAutoFocusText } from "../shared/lib/autoFocusText";

type Props = {
  open: boolean;
  entries: AtlasEntryView[];
  fixedA?: string;
  onClose: () => void;
  onPick: (a: string, b: string) => void;
};

export default function ComparePicker({
  open,
  entries,
  fixedA,
  onClose,
  onPick,
}: Props) {
  const fullScreen = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const first = entries.find((e) => e.id === (fixedA ?? picked)) ?? null;
  const a = first?.id ?? null;

  const rows = useMemo(
    () =>
      browseSections(
        entries.filter((e) => e.id !== a && matchesSearch(e, query)),
      ),
    [entries, a, query],
  );

  const reset = () => {
    setPicked(null);
    setQuery("");
  };
  const choose = (id: string) => {
    if (a === null) {
      setPicked(id);
      setQuery("");
      if (shouldAutoFocusText()) searchRef.current?.focus();
      return;
    }
    onPick(a, id);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="xs"
      aria-labelledby="atlas-compare-picker-title"
      slotProps={{ transition: { onExited: reset } }}
    >
      <DialogTitle id="atlas-compare-picker-title" sx={{ pb: 0.5 }}>
        Compare parasites
      </DialogTitle>
      <Box sx={{ px: 3, pb: 1.5 }}>
        <Typography variant="body2" aria-live="polite" sx={{
          color: "text.secondary"
        }}>
          {first ? (
            <>Step 2 of 2: compare {entryTitles(first).primary} with</>
          ) : (
            "Step 1 of 2: pick the first parasite"
          )}
        </Typography>
        <TextField
          type="search"
          size="small"
          fullWidth
          autoFocus={shouldAutoFocusText()}
          inputRef={searchRef}
          placeholder="Search parasites"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "Search parasites" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mt: 1.5 }}
        />
      </Box>
      <DialogContent
        dividers
        sx={{ p: 0, height: { sm: 420 }, bgcolor: "background.paper" }}
      >
        {rows.length === 0 ? (
          <Typography
            sx={{
              color: "text.secondary",
              px: 3,
              py: 2
            }}>
            No parasites match
          </Typography>
        ) : (
          <List dense disablePadding>
            {rows.map((row) => (
              <li key={row.id}>
                <Box component="ul" sx={{ p: 0 }}>
                  <ListSubheader
                    sx={{ px: 3, lineHeight: "36px", fontWeight: 700 }}
                  >
                    {row.title}
                  </ListSubheader>
                  {row.entries.map((e) => {
                    const titles = entryTitles(e);
                    return (
                      <ListItemButton
                        key={e.id}
                        onClick={() => choose(e.id)}
                        sx={{ px: 3, display: "block" }}
                      >
                        <Typography component="span" sx={{ fontWeight: 600 }}>
                          {titles.primary}
                        </Typography>
                        {titles.scientific ? (
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{
                              color: "text.secondary",
                              ml: 1,
                              fontStyle: "italic"
                            }}>
                            {titles.scientific}
                          </Typography>
                        ) : null}
                      </ListItemButton>
                    );
                  })}
                </Box>
              </li>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3 }}>
        {first && fixedA === undefined ? (
          <Button
            onClick={() => {
              reset();
              if (shouldAutoFocusText()) searchRef.current?.focus();
            }}
            sx={{ mr: "auto" }}
          >
            Back
          </Button>
        ) : null}
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
