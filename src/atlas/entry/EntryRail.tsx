import { useLayoutEffect, useRef, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import AtlasImage, { heroImage } from "../hub/AtlasImage";
import { entryTitles } from "./entryTitles";
import NotInPackChip from "../hub/NotInPackChip";
import type { RailSection } from "../hub/filter";
import type { AtlasEntryView } from "../types";

type Props = {
  rows: RailSection[];
  total: number;
  /** Count after taxonomy (+ search) filter; defaults to total. */
  matched?: number;
  currentId: string;
  query: string;
  onQuery: (q: string) => void;
  taxonomyChip?: { label: string; count: number } | null;
  onClearTaxonomy?: () => void;
  entryHref: (id: string) => string;
  onOpen: (id: string) => void;
  /** Pack-hidden entries shown through Show hidden or search. */
  notInPackIds?: ReadonlySet<string>;
};

export default function EntryRail({
  rows,
  total,
  matched,
  currentId,
  query,
  onQuery,
  taxonomyChip,
  onClearTaxonomy,
  entryHref,
  onOpen,
  notInPackIds,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const shown = matched ?? total;

  // Keep the current entry in view inside the rail without scrolling the page.
  useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !item) return;
    const top = item.offsetTop - list.offsetTop;
    if (
      top < list.scrollTop ||
      top + item.offsetHeight > list.scrollTop + list.clientHeight
    )
      list.scrollTop = top - list.clientHeight / 3;
  }, [currentId, taxonomyChip?.label]);

  const open = (ev: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
      return;
    ev.preventDefault();
    onOpen(id);
  };

  return (
    <Box
      component="nav"
      aria-label={
        taxonomyChip
          ? `Parasites in ${taxonomyChip.label}`
          : "All parasites"
      }
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
      }}
    >
      <TextField
        type="search"
        size="small"
        placeholder={
          taxonomyChip
            ? `Search ${shown} in filter`
            : `Search ${total} parasites`
        }
        value={query}
        onChange={(ev) => onQuery(ev.target.value)}
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
        sx={{ "& .MuiInputBase-root": { bgcolor: "background.paper" } }}
      />
      {taxonomyChip && onClearTaxonomy ? (
        <StackChip
          label={taxonomyChip.label}
          count={taxonomyChip.count}
          onClear={onClearTaxonomy}
        />
      ) : null}
      <Box
        ref={listRef}
        sx={{ mt: 1, overflowY: "auto", minHeight: 0, flex: 1, pr: 0.5 }}
      >
        {rows.length === 0 ? (
          <Typography
            sx={{
              color: "text.secondary",
              fontSize: "0.86rem",
              p: 1
            }}>
            No parasites match
          </Typography>
        ) : null}
        {rows.map((row) => (
          <Box key={row.heading} sx={{ mt: 1.5 }}>
            <Typography
              component="h2"
              sx={{
                color: "text.secondary",
                fontSize: "0.76rem",
                fontWeight: 600,
                px: 0.75,
                mb: 0.5
              }}>
              {row.heading}
            </Typography>
            {row.entries.map((e) => (
              <RailItem
                key={e.id}
                entry={e}
                current={e.id === currentId}
                notInPack={notInPackIds?.has(e.id) ?? false}
                href={entryHref(e.id)}
                onClick={(ev) => open(ev, e.id)}
              />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function StackChip({
  label,
  count,
  onClear,
}: {
  label: string;
  count: number;
  onClear: () => void;
}) {
  return (
    <Box
      sx={{
        mt: 1,
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexWrap: "wrap",
      }}
    >
      <Chip
        size="small"
        color="primary"
        variant="outlined"
        label={`${label} · ${count}`}
        sx={{ fontWeight: 600, maxWidth: "100%" }}
      />
      <Button size="small" onClick={onClear} sx={{ minWidth: 0, px: 0.75 }}>
        Clear
      </Button>
    </Box>
  );
}

function RailItem({
  entry,
  current,
  notInPack,
  href,
  onClick,
}: {
  entry: AtlasEntryView;
  current: boolean;
  notInPack: boolean;
  href: string;
  onClick: (ev: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const titles = entryTitles(entry);
  return (
    <ButtonBase
      component="a"
      href={href}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      sx={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "36px minmax(0, 1fr)",
        gap: 1.25,
        alignItems: "center",
        justifyContent: "stretch",
        textAlign: "left",
        px: 0.75,
        py: 0.625,
        borderRadius: 1.5,
        bgcolor: (t) =>
          current ? alpha(t.palette.primary.main, 0.06) : "transparent",
        boxShadow: (t) =>
          current ? `inset 3px 0 0 ${t.palette.primary.main}` : "none",
        "&:hover": {
          bgcolor: (t) => alpha(t.palette.primary.main, current ? 0.08 : 0.04),
        },
      }}
    >
      <AtlasImage
        image={heroImage(entry)}
        ratio="1 / 1"
        compact
        sx={{ width: 36, borderRadius: 1 }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          noWrap
          sx={{
            fontWeight: 600,
            fontSize: "0.86rem",
            lineHeight: 1.25,
          }}
        >
          {titles.primary}
        </Typography>
        {titles.scientific ? (
          <Typography
            noWrap
            sx={{
              color: "text.secondary",
              fontSize: "0.76rem",
              lineHeight: 1.3,
              fontStyle: "italic"
            }}>
            {titles.scientific}
          </Typography>
        ) : null}
        {notInPack ? <NotInPackChip /> : null}
      </Box>
    </ButtonBase>
  );
}
