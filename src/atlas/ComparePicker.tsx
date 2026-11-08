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
import { GROUP_LABELS, groupRows, matchesSearch } from "./filter";
import type { AtlasEntryView } from "./types";

type Props = {
  open: boolean;
  entries: AtlasEntryView[];
  /** Skips step 1, for "Compare with…" on an entry. */
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
  // Step comes from a resolved entry, so an unknown fixedA falls back to step 1.
  const first = entries.find((e) => e.id === (fixedA ?? picked)) ?? null;
  const a = first?.id ?? null;

  const rows = useMemo(
    () =>
      groupRows(entries.filter((e) => e.id !== a && matchesSearch(e, query))),
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
      searchRef.current?.focus();
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
      // Reset after the fade-out so the list does not jump back to step 1 while visible.
      slotProps={{ transition: { onExited: reset } }}
    >
      <DialogTitle id="atlas-compare-picker-title" sx={{ pb: 0.5 }}>
        Compare parasites
      </DialogTitle>
      <Box sx={{ px: 3, pb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {first ? (
            <>
              Step 2 of 2: compare <i>{first.canonicalName}</i> with
            </>
          ) : (
            "Step 1 of 2: pick the first parasite"
          )}
        </Typography>
        <TextField
          type="search"
          size="small"
          fullWidth
          autoFocus
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
          <Typography color="text.secondary" sx={{ px: 3, py: 2 }}>
            No parasites match
          </Typography>
        ) : (
          <List dense disablePadding>
            {rows.map((row) => (
              <li key={row.group}>
                <Box component="ul" sx={{ p: 0 }}>
                  <ListSubheader
                    sx={{ px: 3, lineHeight: "36px", fontWeight: 700 }}
                  >
                    {GROUP_LABELS[row.group].plural}
                  </ListSubheader>
                  {row.entries.map((e) => (
                    <ListItemButton
                      key={e.id}
                      onClick={() => choose(e.id)}
                      sx={{ px: 3, display: "block" }}
                    >
                      <Typography
                        component="span"
                        sx={{ fontStyle: "italic", fontWeight: 600 }}
                      >
                        {e.canonicalName}
                      </Typography>
                      {e.commonName ? (
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          sx={{ ml: 1 }}
                        >
                          {e.commonName}
                        </Typography>
                      ) : null}
                    </ListItemButton>
                  ))}
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
              searchRef.current?.focus();
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
