import { useLayoutEffect, useRef, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import AtlasImage, { heroImage } from "./AtlasImage";
import { entryTitles } from "./entryTitles";
import type { RailSection } from "./filter";
import type { AtlasEntryView } from "./types";

type Props = {
  rows: RailSection[];
  total: number;
  currentId: string;
  query: string;
  onQuery: (q: string) => void;
  entryHref: (id: string) => string;
  onOpen: (id: string) => void;
};

export default function EntryRail({
  rows,
  total,
  currentId,
  query,
  onQuery,
  entryHref,
  onOpen,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

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
  }, [currentId]);

  const open = (ev: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
      return;
    ev.preventDefault();
    onOpen(id);
  };

  return (
    <Box
      component="nav"
      aria-label="All parasites"
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
        placeholder={`Search ${total} parasites`}
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
      <Box
        ref={listRef}
        sx={{ mt: 1, overflowY: "auto", minHeight: 0, flex: 1, pr: 0.5 }}
      >
        {rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ fontSize: "0.86rem", p: 1 }}>
            No parasites match
          </Typography>
        ) : null}
        {rows.map((row) => (
          <Box key={row.heading} sx={{ mt: 1.5 }}>
            <Typography
              component="h2"
              color="text.secondary"
              sx={{ fontSize: "0.76rem", fontWeight: 600, px: 0.75, mb: 0.5 }}
            >
              {row.heading}
            </Typography>
            {row.entries.map((e) => (
              <RailItem
                key={e.id}
                entry={e}
                current={e.id === currentId}
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

function RailItem({
  entry,
  current,
  href,
  onClick,
}: {
  entry: AtlasEntryView;
  current: boolean;
  href: string;
  onClick: (ev: MouseEvent<HTMLAnchorElement>) => void;
}) {
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
          current ? alpha(t.palette.primary.main, 0.1) : "transparent",
        boxShadow: (t) =>
          current ? `inset 3px 0 0 ${t.palette.primary.main}` : "none",
        "&:hover": {
          bgcolor: (t) => alpha(t.palette.primary.main, current ? 0.12 : 0.05),
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
          {entryTitles(entry).primary}
        </Typography>
        {entryTitles(entry).primary !== entryTitles(entry).scientific ? (
          <Typography
            noWrap
            color="text.secondary"
            sx={{ fontSize: "0.76rem", lineHeight: 1.3, fontStyle: "italic" }}
          >
            {entryTitles(entry).scientific}
          </Typography>
        ) : null}
      </Box>
    </ButtonBase>
  );
}
