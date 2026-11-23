import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  ViewTransition,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import AtlasImage, { heroImage } from "../hub/AtlasImage";
import EntryFacts from "./EntryFacts";
import EntryRail from "./EntryRail";
import { entryMetaLine } from "./entryGlance";
import { entryTitles } from "../lib/entryTitles";
import LifecycleBoard from "../lifecycle/LifecycleBoard";
import {
  entryRefs,
  refAnchor,
  windowLabel,
  type EntryRefs,
} from "./entryFields";
import { FIELD_LABELS } from "./entryFields";
import {
  focusActive as isFocusActive,
  matchesSearch,
  matchesTaxonomy,
  packVisible,
  railSections,
  revealsHidden,
  termLabel,
  type TaxonomyFilter,
} from "../hub/filter";
import { isShortcutTarget } from "../hub/keys";
import { atlasHeroName } from "../paths";
import { atlasBottomSheetPaperSx } from "../hub/atlasOperateSx";
import MarkImportantControl from "./MarkImportantControl";
import type { EditSectionId } from "../mutate/entryPatch";
import type { AtlasEntryView, DatasetFields } from "../types";

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
  onEdit?: (section?: EditSectionId) => void;
  onResetField?: (field: FieldKey) => void;
  resettingFields?: ReadonlySet<FieldKey>;
  onEditLifecycle?: () => void;
  onReset?: () => void;
  onMakeCards?: () => void;
  atlasId?: string;
  onFocusUpdated?: (entry: AtlasEntryView) => void;
  /** Dataset entries the pack does not mention; see packHiddenIds. */
  packHiddenIds: ReadonlySet<string>;
  /** The Cabinet's Show hidden preference, applied to the rail. */
  showHidden: boolean;
  /** Test override for `breakpoints.down("md")`. */
  mobile?: boolean;
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
  onEdit,
  onResetField,
  resettingFields,
  onEditLifecycle,
  onReset,
  onMakeCards,
  atlasId,
  onFocusUpdated,
  packHiddenIds,
  showHidden,
  mobile: mobileProp,
}: Props) {
  const [tab, setTab] = useState<TabKey>("lifecycle");
  // An object per click, so citing the same field twice still scrolls.
  const [cite, setCite] = useState<{ field: FieldKey } | null>(null);
  const [query, setQuery] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilter | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Sticky rail is lg+; only open the mobile drawer below that.
  const isLgUp = useMediaQuery((t: Theme) => t.breakpoints.up("lg"));
  const mobileMq = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const mobile = mobileProp ?? mobileMq;

  const useFocus = isFocusActive(entries);
  const railEntries = useMemo(() => {
    const revealHidden = revealsHidden(showHidden, query);
    return entries.filter(
      (e) =>
        matchesTaxonomy(e, taxonomy) &&
        matchesSearch(e, query) &&
        (e.id === entry.id || packVisible(e, packHiddenIds, revealHidden)),
    );
  }, [entries, taxonomy, query, entry.id, packHiddenIds, showHidden]);
  const rows = useMemo(
    () => railSections(railEntries, useFocus),
    [railEntries, useFocus],
  );
  const order = useMemo(
    () => rows.flatMap((r) => r.entries.map((e) => e.id)),
    [rows],
  );
  const refs = useMemo(() => entryRefs(entry.refs), [entry.refs]);
  const titles = entryTitles(entry);
  const meta = entryMetaLine(entry.fields);
  const notInPack = packHiddenIds.has(entry.id);

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
  const onTaxonomyBrowse = (next: TaxonomyFilter) => {
    setTaxonomy((cur) =>
      cur && cur.rank === next.rank && cur.value === next.value ? null : next,
    );
    if (!isLgUp) setDrawerOpen(true);
  };
  const taxonomyChip = taxonomy
    ? {
        label: `${FIELD_LABELS[taxonomy.rank]}: ${taxonomy.value}`,
        count: railEntries.length,
      }
    : null;
  const rail = (
    <EntryRail
      rows={rows}
      total={entries.length}
      matched={railEntries.length}
      currentId={entry.id}
      query={query}
      onQuery={setQuery}
      taxonomyChip={taxonomyChip}
      onClearTaxonomy={taxonomy ? () => setTaxonomy(null) : undefined}
      entryHref={entryHref}
      onOpen={openFromRail}
      notInPackIds={packHiddenIds}
    />
  );

  const { fields } = entry;
  const hero = heroImage(entry);
  const onCite = (field: FieldKey) => {
    setCite({ field });
    setTab("references");
  };

  return (
    <Box
      sx={{
        display: "grid",
        gap: { xs: 2, md: 3 },
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          lg: "240px minmax(0, 1fr)",
        },
        gridTemplateAreas: {
          xs: '"head" "glance" "board"',
          lg: '"rail head" "rail glance" "rail board"',
        },
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
        sx={{
          gap: { xs: 1.5, sm: 2.25 },
          alignItems: "flex-start",
          gridArea: "head",
          minWidth: 0,
        }}
      >
        <Box sx={{ flex: "none", width: { xs: 84, sm: 120 } }}>
          <ViewTransition name={atlasHeroName(entry.id)} share="atlas-morph">
            <AtlasImage
              image={hero}
              ratio="6 / 5"
              sx={{
                width: "100%",
                borderRadius: 1.5,
                border: 1,
                borderColor: "divider",
                "& > span": { fontSize: "0.68rem", textAlign: "center" },
              }}
            />
          </ViewTransition>
          {hero ? (
            <Typography
              sx={{
                color: "text.secondary",
                mt: 0.5,
                fontSize: "0.68rem",
                lineHeight: 1.3,
              }}
            >
              <Link
                href={hero.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
              >
                {hero.credit}
              </Link>
              , {hero.license}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontWeight: 600,
              fontSize: { xs: "1.6rem", md: "2.125rem" },
              lineHeight: 1.1,
              overflowWrap: "anywhere",
            }}
          >
            {titles.primary}
          </Typography>
          {titles.scientific ? (
            <Typography
              sx={{
                color: "text.secondary",
                mt: 0.5,
                fontStyle: "italic",
              }}
            >
              {titles.scientific}
            </Typography>
          ) : null}
          {meta ? (
            <Typography
              sx={{
                color: "text.secondary",
                mt: 1,
                fontSize: "0.86rem",
                lineHeight: 1.4,
              }}
            >
              {meta}
            </Typography>
          ) : null}
          {notInPack ? (
            <Alert
              severity="info"
              sx={{ mt: 1.25, py: 0, alignItems: "center" }}
              action={
                atlasId && onFocusUpdated ? (
                  <MarkImportantControl
                    atlasId={atlasId}
                    entry={entry}
                    onUpdated={onFocusUpdated}
                    pinLabel="Pin (always show)"
                  />
                ) : undefined
              }
            >
              Not in your course pack
            </Alert>
          ) : null}
          {atlasId && onFocusUpdated && !notInPack ? (
            <Box sx={{ mt: 1.25 }}>
              <MarkImportantControl
                atlasId={atlasId}
                entry={entry}
                onUpdated={onFocusUpdated}
                pinLabel="Pin (always show)"
              />
            </Box>
          ) : null}
        </Box>
        <Button
          variant="outlined"
          size="small"
          aria-label="All parasites"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          sx={{
            display: { lg: "none" },
            flex: "none",
            minWidth: 44,
            minHeight: 44,
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

      <Box sx={{ gridArea: "glance", minWidth: 0 }}>
        <EntryFacts
          entry={entry}
          refs={refs}
          onCite={onCite}
          onTaxonomyBrowse={onTaxonomyBrowse}
          taxonomyActive={taxonomy}
          onEdit={onEdit}
          onResetField={onResetField}
          resettingFields={resettingFields}
          onReset={onReset}
          onMakeCards={onMakeCards}
          atlasId={atlasId}
          onNoteUpdated={onFocusUpdated}
        />
      </Box>

      <Paper
        variant="outlined"
        sx={(theme) => ({
          gridArea: "board",
          minWidth: 0,
          px: { xs: 2, sm: 2.75 },
          pb: 2.5,
          borderRadius: 2,
          ...theme.applyStyles("dark", {
            bgcolor: "rgba(232, 216, 199, 0.045)",
          }),
        })}
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
            <LifecycleBoard
              key={entry.id}
              fields={fields}
              images={entry.images}
              onEditLifecycle={onEditLifecycle}
            />
          ) : tab === "diagnosis" ? (
            <Diagnosis fields={fields} />
          ) : (
            <References refs={refs} />
          )}
        </Box>
      </Paper>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        anchor={mobile ? "bottom" : "left"}
        aria-label="All parasites"
        slotProps={{
          paper: {
            sx: mobile
              ? atlasBottomSheetPaperSx
              : {
                  width: "min(320px, 88vw)",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                },
          },
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
      <Box>
        <Typography component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Tests
        </Typography>
        {tests.length === 0 ? (
          <Typography
            sx={{
              color: "text.secondary",
            }}
          >
            No tests recorded yet.
          </Typography>
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
                    borderBottom: 1,
                    borderColor: "divider",
                    px: 0.25,
                    py: 1.25,
                  }}
                >
                  <Typography sx={{ fontWeight: 600 }}>
                    {termLabel(t.name)}
                  </Typography>
                  <Typography
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.88rem",
                    }}
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
    return (
      <Typography
        sx={{
          color: "text.secondary",
        }}
      >
        No references yet.
      </Typography>
    );
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
            sx={{
              color: "text.secondary",
              fontSize: "0.78rem",
              fontWeight: 700,
              mb: 0.75,
            }}
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
                      sx={{
                        color: "text.secondary",
                        fontSize: "0.84rem",
                        mt: 0.25,
                      }}
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
