import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  ViewTransition,
} from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import AtlasImage, { heroImage } from "./AtlasImage";
import EntryFacts from "./EntryFacts";
import EntryRail from "./EntryRail";
import LifecycleBoard from "./LifecycleBoard";
import {
  entryRefs,
  refAnchor,
  windowLabel,
  type EntryRefs,
} from "./entryFields";
import { groupRows, matchesSearch, pppLabel, termLabel } from "./filter";
import { isShortcutTarget } from "./keys";
import { atlasHeroName } from "./paths";
import type { AtlasEntryView, DatasetFields } from "./types";

type FieldKey = keyof DatasetFields;
type TabKey = "lifecycle" | "diagnosis" | "references";

type Props = {
  entry: AtlasEntryView;
  entries: AtlasEntryView[];
  entryHref: (id: string) => string;
  /** Opens an entry as a new history step (rail click). */
  onOpen: (id: string) => void;
  /** Moves to a neighbour without growing history (j/k). */
  onStep: (id: string) => void;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "lifecycle", label: "Lifecycle" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "references", label: "References" },
];

export default function EntryView({
  entry,
  entries,
  entryHref,
  onOpen,
  onStep,
}: Props) {
  const [tab, setTab] = useState<TabKey>("lifecycle");
  // An object per click, so citing the same field twice still scrolls.
  const [cite, setCite] = useState<{ field: FieldKey } | null>(null);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rows = useMemo(
    () => groupRows(entries.filter((e) => matchesSearch(e, query))),
    [entries, query],
  );
  const order = useMemo(
    () => rows.flatMap((r) => r.entries.map((e) => e.id)),
    [rows],
  );
  const refs = useMemo(() => entryRefs(entry.refs), [entry.refs]);

  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (!isShortcutTarget(ev) || (ev.key !== "j" && ev.key !== "k")) return;
    const i = order.indexOf(entry.id);
    const next = order[i === -1 ? 0 : i + (ev.key === "j" ? 1 : -1)];
    if (next && next !== entry.id) onStep(next);
  });
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (tab !== "references" || cite === null) return;
    const target = document.getElementById(refAnchor(cite.field));
    setCite(null);
    if (!target) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      block: "start",
      behavior: reduce ? "auto" : "smooth",
    });
    target.focus({ preventScroll: true });
  }, [tab, cite]);

  const openFromRail = (id: string) => {
    setDrawerOpen(false);
    onOpen(id);
  };
  const rail = (
    <EntryRail
      rows={rows}
      total={entries.length}
      currentId={entry.id}
      query={query}
      onQuery={setQuery}
      entryHref={entryHref}
      onOpen={openFromRail}
    />
  );

  const { fields } = entry;
  const chips = [
    fields.group && termLabel(fields.group),
    fields.family,
    fields.lifecycleType && `${termLabel(fields.lifecycleType)} lifecycle`,
    fields.pppDays && `PPP ${pppLabel(fields.pppDays)}`,
  ].filter((c): c is string => Boolean(c));

  return (
    <Box
      sx={{
        display: "grid",
        gap: { xs: 2, md: 3 },
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          lg: "240px minmax(0, 1fr)",
        },
        // The lane board needs the width, so the facts sit below it at every size.
        gridTemplateAreas: {
          xs: '"head" "board" "side"',
          lg: '"rail head" "rail board" "rail side"',
        },
        // The tall sticky rail spans every row; leftover height goes to the last row, not between sections.
        gridTemplateRows: { lg: "auto auto 1fr" },
        alignItems: "start",
      }}
    >
      <Box
        sx={{
          gridArea: "rail",
          display: { xs: "none", lg: "flex" },
          position: "sticky",
          top: 16,
          height: "calc(100dvh - 128px)",
          minHeight: 360,
        }}
      >
        {rail}
      </Box>

      <Stack
        component="header"
        direction="row"
        gap={{ xs: 1.5, sm: 2.25 }}
        alignItems="flex-start"
        sx={{ gridArea: "head", minWidth: 0 }}
      >
        <ViewTransition name={atlasHeroName(entry.id)} share="atlas-morph">
          <AtlasImage
            image={heroImage(entry)}
            ratio="6 / 5"
            sx={{
              width: { xs: 84, sm: 120 },
              flex: "none",
              borderRadius: 1.5,
              border: 1,
              borderColor: "divider",
              "& > span": { fontSize: "0.68rem", textAlign: "center" },
            }}
          />
        </ViewTransition>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: { xs: "1.6rem", md: "2.125rem" },
              lineHeight: 1.1,
              overflowWrap: "anywhere",
            }}
          >
            {entry.canonicalName}
          </Typography>
          {entry.commonName ? (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {entry.commonName}
            </Typography>
          ) : null}
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.25 }}>
            {chips.map((c) => (
              <Chip
                key={c}
                label={c}
                size="small"
                variant="outlined"
                sx={{ bgcolor: "background.paper", color: "text.secondary" }}
              />
            ))}
          </Stack>
        </Box>
        <Button
          variant="outlined"
          size="small"
          aria-label="All parasites"
          onClick={() => setDrawerOpen(true)}
          sx={{
            display: { lg: "none" },
            flex: "none",
            minWidth: 0,
            px: { xs: 1, sm: 1.5 },
            gap: 1,
            bgcolor: "background.paper",
          }}
        >
          <FormatListBulletedIcon fontSize="small" />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            All parasites
          </Box>
        </Button>
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          gridArea: "board",
          minWidth: 0,
          px: { xs: 2, sm: 2.75 },
          pb: 2.5,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, next: TabKey) => setTab(next)}
          aria-label="Entry sections"
          sx={{ borderBottom: 1, borderColor: "divider", mb: 2.5 }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              label={t.label}
              id={`atlas-tab-${t.key}`}
              // Only the selected panel is rendered, so only its tab points at one.
              aria-controls={t.key === tab ? `atlas-panel-${t.key}` : undefined}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                minWidth: 0,
                px: 1.5,
              }}
            />
          ))}
        </Tabs>
        <Box
          role="tabpanel"
          id={`atlas-panel-${tab}`}
          aria-labelledby={`atlas-tab-${tab}`}
        >
          {tab === "lifecycle" ? (
            <LifecycleBoard key={entry.id} fields={fields} />
          ) : tab === "diagnosis" ? (
            <Diagnosis fields={fields} />
          ) : (
            <References refs={refs} />
          )}
        </Box>
      </Paper>

      <Box sx={{ gridArea: "side", minWidth: 0 }}>
        <EntryFacts
          entry={entry}
          refs={refs}
          onCite={(field) => {
            setCite({ field });
            setTab("references");
          }}
        />
      </Box>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{
          paper: { sx: { width: "min(320px, 88vw)", p: 2, display: "flex" } },
        }}
      >
        {rail}
      </Drawer>
    </Box>
  );
}

function Diagnosis({ fields }: { fields: DatasetFields }) {
  const tests = fields.diagnosticTests;
  return (
    <Stack spacing={2.5}>
      <Box component="dl" sx={{ m: 0, display: "grid", gap: 1.25 }}>
        {(
          [
            [
              "Diagnostic stage",
              fields.diagnosticStage && termLabel(fields.diagnosticStage),
            ],
            ["Prepatent period", pppLabel(fields.pppDays)],
          ] as const
        ).map(([label, value]) => (
          <Box key={label}>
            <Typography
              component="dt"
              color="text.secondary"
              sx={{ fontSize: "0.76rem", fontWeight: 600 }}
            >
              {label}
            </Typography>
            <Typography component="dd" sx={{ m: 0 }}>
              {value ?? "Not recorded"}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box>
        <Typography component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Tests
        </Typography>
        {tests.length === 0 ? (
          <Typography color="text.secondary">No tests recorded yet.</Typography>
        ) : (
          <Box
            component="ul"
            sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}
          >
            {tests.map((t, i) => {
              const when = windowLabel(t.windowStartWeek, t.windowEndWeek);
              return (
                <Box
                  component="li"
                  key={`${t.name}-${i}`}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1.5,
                    px: 1.75,
                    py: 1.25,
                  }}
                >
                  <Typography sx={{ fontWeight: 600 }}>
                    {termLabel(t.name)}
                  </Typography>
                  <Typography
                    color="text.secondary"
                    sx={{ fontSize: "0.88rem" }}
                  >
                    {[
                      t.sample && `Sample: ${t.sample}`,
                      when ?? "Window not stated",
                    ]
                      .filter(Boolean)
                      .join(". ")}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

function References({ refs }: { refs: EntryRefs }) {
  if (refs.groups.length === 0) {
    return <Typography color="text.secondary">No references yet.</Typography>;
  }
  return (
    <Stack spacing={2.5}>
      {refs.groups.map((g) => (
        <Box
          key={g.label}
          id={refAnchor(g.field)}
          tabIndex={-1}
          component="section"
          sx={{ scrollMarginTop: 16, outline: "none" }}
        >
          <Typography
            component="h2"
            color="text.secondary"
            sx={{ fontSize: "0.78rem", fontWeight: 700, mb: 0.75 }}
          >
            {g.label}
          </Typography>
          <Box
            component="ol"
            sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}
          >
            {g.refs.map(({ n, ref }, i) => (
              <Box
                component="li"
                key={`${n}-${i}`}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr",
                  fontSize: "0.9rem",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    color: "primary.main",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {n}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  {ref.url ? (
                    <Link
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      {ref.citation}
                    </Link>
                  ) : (
                    ref.citation
                  )}
                  {ref.note ? (
                    <Typography
                      color="text.secondary"
                      sx={{ fontSize: "0.84rem", mt: 0.25 }}
                    >
                      {ref.note}
                    </Typography>
                  ) : null}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
