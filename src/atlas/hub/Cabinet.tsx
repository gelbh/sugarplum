import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
} from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import FilterListIcon from "@mui/icons-material/FilterList";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import AtlasFilters from "./AtlasFilters";
import AtlasTable from "./AtlasTable";
import { atlasBottomSheetPaperSx } from "./atlasOperateSx";
import ComparePicker from "../compare/ComparePicker";
import SpecimenTile from "../entry/SpecimenTile";
import {
  NO_FILTERS,
  applyFilters,
  browseSections,
  byName,
  filtersActive,
  filtersActiveCount,
  focusActive as isFocusActive,
  hostOptions,
  matchesSearch,
  organOptions,
  presentGroups,
  type AtlasFilters as Filters,
} from "./filter";
import { readViewPref, writeViewPref, type AtlasViewMode } from "./viewPref";
import type { AtlasEntryView } from "../types";

type Props = {
  entries: AtlasEntryView[];
  userKey: string;
  entryHref: (id: string) => string;
  onOpenEntry: (id: string) => void;
  onCompare: (a: string, b: string) => void;
  stagger: boolean;
  onAddEntry?: () => void;
  onRecentlyDeleted?: () => void;
  onEditEntry?: (entry: AtlasEntryView) => void;
  /** Keys for the currently visible Key row (already filtered). */
  onMakeCardsFromKey?: (entryKeys: string[]) => void;
  atlasId?: string;
  onFocusUpdated?: (entry: AtlasEntryView) => void;
  /** Test override for `breakpoints.down("md")`. */
  mobile?: boolean;
};

const plural = (n: number) => `${n} ${n === 1 ? "parasite" : "parasites"}`;

export default function Cabinet({
  entries,
  userKey,
  entryHref,
  onOpenEntry,
  onCompare,
  stagger,
  onAddEntry,
  onRecentlyDeleted,
  onEditEntry,
  onMakeCardsFromKey,
  atlasId,
  onFocusUpdated,
  mobile: mobileProp,
}: Props) {
  const mobileMq = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const mobile = mobileProp ?? mobileMq;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<AtlasViewMode>(() => readViewPref(userKey));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = filtersActiveCount(filters);
  const shownFilters = useDeferredValue(filters);
  const staggering = useRef(stagger);
  useEffect(() => {
    staggering.current = false;
  }, []);

  const focusActive = isFocusActive(entries);
  useEffect(() => {
    if (!focusActive && filters.tier !== null) {
      setFilters((f) => ({ ...f, tier: null }));
    }
  }, [focusActive, filters.tier]);
  const options = useMemo(
    () => ({
      groups: presentGroups(entries),
      hosts: hostOptions(entries),
      organs: organOptions(entries),
    }),
    [entries],
  );
  const visible = useMemo(
    () =>
      applyFilters(entries, shownFilters).filter((e) =>
        matchesSearch(e, query),
      ),
    [entries, shownFilters, query],
  );
  const keyEntries = useMemo(
    () =>
      focusActive ? visible.filter((e) => e.tier === "key").sort(byName) : [],
    [focusActive, visible],
  );
  const showKeyRow = keyEntries.length > 0;
  const rows = useMemo(
    () =>
      browseSections(
        showKeyRow ? visible.filter((e) => e.tier !== "key") : visible,
      ),
    [showKeyRow, visible],
  );
  const gridSections = useMemo(
    () => [
      ...(showKeyRow
        ? [
            {
              id: "key",
              title: "Key",
              subtitle: `Course focus, ${keyEntries.length} ${
                keyEntries.length === 1 ? "entry" : "entries"
              }`,
              entries: keyEntries,
            },
          ]
        : []),
      ...rows,
    ],
    [showKeyRow, keyEntries, rows],
  );
  const tileIndex = useMemo(
    () =>
      new Map(gridSections.flatMap((s) => s.entries).map((e, i) => [e.id, i])),
    [gridSections],
  );
  const expanded =
    expandedId !== null && visible.some((e) => e.id === expandedId)
      ? expandedId
      : null;

  useEffect(() => {
    if (expanded === null) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setExpandedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const narrowed = visible.length !== entries.length;
  const clearAll = () => {
    setFilters(NO_FILTERS);
    setQuery("");
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{
          alignItems: { md: "flex-end" },
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 600, color: "text.primary" }}
          >
            Parasitology Atlas
          </Typography>
          <Typography
            variant="body2"
            aria-live="polite"
            sx={{
              color: "text.secondary",
              mt: 0.5,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {narrowed
              ? `${visible.length} of ${plural(entries.length)}`
              : plural(entries.length)}
          </Typography>
        </Box>
        <Stack
          direction="row"
          sx={{
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <TextField
            type="search"
            size="small"
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
            sx={{
              flex: { xs: 1, md: "none" },
              width: { md: 320 },
              "& .MuiInputBase-root": { bgcolor: "background.paper" },
            }}
          />
          {mobile ? (
            <Button
              variant="outlined"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-controls="atlas-filters-sheet"
              aria-label={
                activeFilterCount > 0
                  ? `Filters, ${activeFilterCount} active`
                  : "Filters"
              }
              sx={{
                bgcolor: "background.paper",
                flex: "none",
                minHeight: 44,
                minWidth: 44,
                height: 44,
                px: 1.5,
                gap: 0.75,
              }}
            >
              <FilterListIcon fontSize="small" />
              Filters
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          ) : null}
          {onMakeCardsFromKey && showKeyRow ? (
            <Button
              variant="contained"
              onClick={() =>
                onMakeCardsFromKey(keyEntries.map((e) => e.originKey ?? e.id))
              }
              aria-label="Make cards from Key"
              sx={{
                flex: "none",
                minHeight: mobile ? 44 : 40,
                height: mobile ? 44 : 40,
                px: { xs: 1.25, sm: 1.75 },
              }}
            >
              Make cards from Key
            </Button>
          ) : null}
          {onAddEntry ? (
            <Button
              variant="outlined"
              onClick={onAddEntry}
              aria-label="Add entry"
              sx={{
                bgcolor: "background.paper",
                flex: "none",
                minHeight: mobile ? 44 : 40,
                height: mobile ? 44 : 40,
                minWidth: { xs: 40, sm: 64 },
                px: { xs: 1, sm: 1.75 },
              }}
            >
              <AddIcon fontSize="small" sx={{ mr: { sm: 0.75 } }} />
              <Box
                component="span"
                sx={{ display: { xs: "none", sm: "inline" } }}
              >
                Add entry
              </Box>
            </Button>
          ) : null}
          <Button
            variant="outlined"
            onClick={() => setComparing(true)}
            disabled={entries.length < 2}
            aria-label="Compare"
            sx={{
              bgcolor: "background.paper",
              flex: "none",
              minHeight: mobile ? 44 : 40,
              height: mobile ? 44 : 40,
              minWidth: { xs: 40, sm: 64 },
              px: { xs: 1, sm: 1.75 },
            }}
          >
            <CompareArrowsIcon fontSize="small" sx={{ mr: { sm: 0.75 } }} />
            <Box
              component="span"
              sx={{ display: { xs: "none", sm: "inline" } }}
            >
              Compare
            </Box>
          </Button>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            aria-label="Layout"
            onChange={(_, next: AtlasViewMode | null) => {
              if (!next) return;
              setView(next);
              writeViewPref(userKey, next);
            }}
            sx={{ bgcolor: "background.paper", flex: "none" }}
          >
            <ToggleButton value="grid" aria-label="Grid">
              <GridViewOutlinedIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="table" aria-label="Table">
              <TableRowsOutlinedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          {onRecentlyDeleted ? (
            <>
              <IconButton
                aria-label="Atlas menu"
                onClick={(ev) => setMenuAnchor(ev.currentTarget)}
                sx={{
                  bgcolor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    onRecentlyDeleted();
                  }}
                >
                  Recently deleted
                </MenuItem>
              </Menu>
            </>
          ) : null}
        </Stack>
      </Stack>

      {mobile ? (
        <Drawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          anchor="bottom"
          aria-labelledby="atlas-filters-sheet-title"
          id="atlas-filters-sheet"
          slotProps={{
            paper: { sx: atlasBottomSheetPaperSx },
          }}
        >
          <Typography
            id="atlas-filters-sheet-title"
            sx={{ fontWeight: 600, mb: 1.5, flexShrink: 0 }}
          >
            Filters
          </Typography>
          <Box sx={{ overflow: "auto", minHeight: 0, flex: 1 }}>
            <AtlasFilters
              filters={filters}
              groups={options.groups}
              hostOptions={options.hosts}
              organOptions={options.organs}
              focusActive={focusActive}
              onChange={setFilters}
            />
          </Box>
        </Drawer>
      ) : (
        <Box
          sx={{ borderBottom: 1, borderColor: "divider", pb: 1.5 }}
          data-testid="atlas-filters-inline"
        >
          <AtlasFilters
            filters={filters}
            groups={options.groups}
            hostOptions={options.hosts}
            organOptions={options.organs}
            focusActive={focusActive}
            onChange={setFilters}
          />
        </Box>
      )}

      {visible.length === 0 ? (
        <Stack
          spacing={1}
          sx={{
            alignItems: "flex-start",
            py: 4,
          }}
        >
          <Typography sx={{ fontWeight: 600 }}>
            No parasites match these filters
          </Typography>
          {filtersActive(filters) || query ? (
            <Button variant="outlined" size="small" onClick={clearAll}>
              Clear filters
            </Button>
          ) : null}
        </Stack>
      ) : view === "table" ? (
        <AtlasTable
          entries={visible}
          entryHref={entryHref}
          onOpen={onOpenEntry}
          focusActive={focusActive}
        />
      ) : (
        <Stack spacing={3}>
          {gridSections.map((section) => (
            <Box
              component="section"
              key={section.id}
              aria-labelledby={`atlas-row-${section.id}`}
            >
              <Stack
                direction="row"
                sx={{
                  alignItems: "baseline",
                  gap: 1.25,
                  mb: 1.25,
                }}
              >
                <Typography
                  id={`atlas-row-${section.id}`}
                  component="h2"
                  sx={{ fontWeight: 700, fontSize: "1.06rem" }}
                >
                  {section.title}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                  }}
                >
                  {section.subtitle}
                </Typography>
              </Stack>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "repeat(auto-fill, minmax(164px, 1fr))",
                  },
                  gridAutoFlow: "row dense",
                  gap: { xs: 1.25, sm: 1.75 },
                  alignItems: "stretch",
                }}
              >
                {section.entries.map((e) => (
                  <ViewTransition
                    key={e.id}
                    name={`atlas-tile-${e.id}`}
                    update="atlas-reflow"
                  >
                    <SpecimenTile
                      entry={e}
                      expanded={expanded === e.id}
                      dimmed={expanded !== null && expanded !== e.id}
                      staggerIndex={
                        staggering.current ? tileIndex.get(e.id) : undefined
                      }
                      onToggle={() =>
                        setExpandedId((cur) => (cur === e.id ? null : e.id))
                      }
                      onOpen={() => onOpenEntry(e.id)}
                      onEdit={onEditEntry ? () => onEditEntry(e) : undefined}
                      atlasId={atlasId}
                      onFocusUpdated={onFocusUpdated}
                    />
                  </ViewTransition>
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
      <ComparePicker
        open={comparing}
        entries={entries}
        onClose={() => setComparing(false)}
        onPick={(a, b) => {
          setComparing(false);
          onCompare(a, b);
        }}
      />
    </Stack>
  );
}
