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
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import SearchIcon from "@mui/icons-material/Search";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import AtlasFilters from "./AtlasFilters";
import AtlasTable from "./AtlasTable";
import ComparePicker from "./ComparePicker";
import SpecimenTile from "./SpecimenTile";
import {
  GROUP_LABELS,
  NO_FILTERS,
  applyFilters,
  filtersActive,
  groupRows,
  hostOptions,
  matchesSearch,
  organOptions,
  presentGroups,
  type AtlasFilters as Filters,
} from "./filter";
import { readViewPref, writeViewPref, type AtlasViewMode } from "./viewPref";
import type { AtlasEntryView } from "./types";

type Props = {
  entries: AtlasEntryView[];
  userKey: string;
  entryHref: (id: string) => string;
  onOpenEntry: (id: string) => void;
  onCompare: (a: string, b: string) => void;
  stagger: boolean;
};

const plural = (n: number) => `${n} ${n === 1 ? "parasite" : "parasites"}`;

export default function Cabinet({
  entries,
  userKey,
  entryHref,
  onOpenEntry,
  onCompare,
  stagger,
}: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<AtlasViewMode>(() => readViewPref(userKey));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const shownFilters = useDeferredValue(filters);
  const staggering = useRef(stagger);
  useEffect(() => {
    staggering.current = false;
  }, []);

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
  const rows = useMemo(() => groupRows(visible), [visible]);
  const tileIndex = useMemo(
    () => new Map(rows.flatMap((r) => r.entries).map((e, i) => [e.id, i])),
    [rows],
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
        alignItems={{ md: "flex-end" }}
        gap={2}
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
            color="text.secondary"
            aria-live="polite"
            sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
          >
            {narrowed
              ? `${visible.length} of ${plural(entries.length)}`
              : plural(entries.length)}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="center">
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
          <Button
            variant="outlined"
            onClick={() => setComparing(true)}
            disabled={entries.length < 2}
            aria-label="Compare"
            sx={{
              bgcolor: "background.paper",
              flex: "none",
              height: 40,
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
        </Stack>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: "divider", pb: 1.5 }}>
        <AtlasFilters
          filters={filters}
          groups={options.groups}
          hostOptions={options.hosts}
          organOptions={options.organs}
          onChange={setFilters}
        />
      </Box>

      {visible.length === 0 ? (
        <Stack alignItems="flex-start" spacing={1} sx={{ py: 4 }}>
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
        />
      ) : (
        <Stack spacing={3}>
          {rows.map((row) => (
            <Box
              component="section"
              key={row.group}
              aria-labelledby={`atlas-row-${row.group}`}
            >
              <Stack
                direction="row"
                alignItems="baseline"
                gap={1.25}
                sx={{ mb: 1.25 }}
              >
                <Typography
                  id={`atlas-row-${row.group}`}
                  component="h2"
                  sx={{ fontWeight: 700, fontSize: "1.06rem" }}
                >
                  {GROUP_LABELS[row.group].plural}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {GROUP_LABELS[row.group].common}, {row.entries.length}{" "}
                  {row.entries.length === 1 ? "entry" : "entries"}
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
                {row.entries.map((e) => (
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
