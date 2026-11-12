import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { type EntryRefs } from "./entryFields";
import type { GlanceRow, TaxonomyNode } from "./entryGlance";
import DistributionSilhouette from "./DistributionSilhouette";
import PppGlance from "./PppGlance";
import { glanceIconFor } from "./glanceIcons";
import { resolveHostPortrait } from "./hostPortraits";
import { resolveSitePortrait } from "./sitePortraits";
import { resolveStagePortrait } from "./stagePortraits";
import {
  resolveZoonoticGlyph,
  zoonoticPortraitLabel,
} from "./zoonoticPortraits";
import TermList from "./TermList";
import { isTaxonTerm, termLabel, type TaxonomyFilter } from "./filter";
import type { DatasetFields } from "./types";

const HOST_KEYS = new Set([
  "definitiveHosts",
  "intermediateHosts",
  "paratenicHosts",
]);
const SITE_KEY = "majorOrgan";
const STAGE_KEY = "onHostStages";
const DIAG_KEY = "diagnosticStage";
const INFECTIVE_KEY = "infective";
const ZOONOTIC_KEY = "zoonotic";
const DISTRIBUTION_KEY = "distribution";
const PPP_KEY = "pppDays";
const PAIR_PORTRAIT_KEYS = new Set([
  SITE_KEY,
  STAGE_KEY,
  DIAG_KEY,
  INFECTIVE_KEY,
  ZOONOTIC_KEY,
]);
const PORTRAIT_KEYS = new Set([...HOST_KEYS, ...PAIR_PORTRAIT_KEYS]);

type FieldKey = keyof DatasetFields;

export function CiteSup({
  field,
  label,
  refs,
  onCite,
}: {
  field: FieldKey;
  label: string;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
}) {
  const cited = refs.byField.get(field) ?? [];
  if (cited.length === 0) return null;
  return (
    <Link
      component="button"
      type="button"
      onClick={() => onCite(field)}
      underline="hover"
      aria-label={`Sources for ${label}: ${cited.join(", ")}`}
      sx={{
        ml: 0.25,
        px: 0.25,
        fontSize: "0.68rem",
        verticalAlign: "super",
        lineHeight: 1,
        my: "-0.5em",
        fontWeight: 700,
      }}
    >
      {cited.join(",")}
    </Link>
  );
}

function ZoonoticStrip({
  terms,
  tileMax = 140,
  fill,
}: {
  terms: string[];
  tileMax?: number;
  fill?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        mt: 0.75,
        width: fill ? "100%" : undefined,
      }}
    >
      {terms.map((term) => {
        const glyph = resolveZoonoticGlyph(term);
        const label = zoonoticPortraitLabel(term);
        const Icon = glyph?.Icon;
        return (
          <Box
            key={term}
            sx={{
              flex: fill ? "1 1 96px" : `0 0 ${Math.min(tileMax, 120)}px`,
              maxWidth: fill ? undefined : Math.min(tileMax, 120),
              minWidth: fill ? 88 : undefined,
              width: fill ? undefined : Math.min(tileMax, 120),
              borderRadius: 1.25,
              overflow: "hidden",
              border: 1,
              borderColor: "divider",
              bgcolor: "background.default",
            }}
          >
            <Box
              sx={{
                position: "relative",
                aspectRatio: "1 / 1",
                bgcolor: "action.hover",
                display: "grid",
                placeItems: "center",
              }}
            >
              {Icon ? (
                <Icon
                  aria-hidden
                  sx={{ fontSize: "2.25rem", color: "text.secondary" }}
                />
              ) : (
                <Typography sx={{ fontWeight: 700, color: "text.secondary" }}>
                  {label.slice(0, 1).toUpperCase()}
                </Typography>
              )}
            </Box>
            <Typography
              sx={{
                px: 0.75,
                py: 0.65,
                fontSize: "0.8rem",
                lineHeight: 1.25,
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function PortraitStrip({
  terms,
  resolve,
  labelFor,
  tileMax = 140,
  fill,
}: {
  terms: string[];
  resolve: (term: string) => { src: string } | null;
  labelFor?: (term: string) => string;
  /** Max tile edge when filling a band. */
  tileMax?: number;
  /** Grow tiles evenly to fill the band (no dead gutter). */
  fill?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        mt: 0.75,
        width: fill ? "100%" : undefined,
      }}
    >
      {terms.map((term) => {
        const portrait = resolve(term);
        const label =
          labelFor?.(term) ??
          (isTaxonTerm(term) ? term : termLabel(term));
        return (
          <Box
            key={term}
            sx={{
              flex: fill ? "1 1 96px" : `0 0 ${Math.min(tileMax, 120)}px`,
              maxWidth: fill ? undefined : Math.min(tileMax, 120),
              minWidth: fill ? 88 : undefined,
              width: fill ? undefined : Math.min(tileMax, 120),
              borderRadius: 1.25,
              overflow: "hidden",
              border: 1,
              borderColor: "divider",
              bgcolor: "background.default",
              transition: "border-color 160ms ease, box-shadow 160ms ease",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: (t) =>
                  `0 0 0 1px ${t.palette.primary.main}22`,
              },
            }}
          >
            <Box
              sx={{
                position: "relative",
                aspectRatio: "1 / 1",
                bgcolor: "action.hover",
              }}
            >
              {portrait ? (
                <Box
                  component="img"
                  src={portrait.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  sx={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center 30%",
                    display: "block",
                  }}
                />
              ) : (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: "1.1rem",
                    color: "text.secondary",
                    fontWeight: 700,
                  }}
                >
                  {label.slice(0, 1).toUpperCase()}
                </Box>
              )}
            </Box>
            <Typography
              sx={{
                px: 0.75,
                py: 0.65,
                fontSize: "0.8rem",
                lineHeight: 1.25,
                textAlign: "center",
                fontWeight: 600,
                fontStyle: isTaxonTerm(term) ? "italic" : "normal",
              }}
            >
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function GlanceValue({
  row,
  siteTileMax,
  fillPortraits,
}: {
  row: GlanceRow;
  siteTileMax?: number;
  fillPortraits?: boolean;
}) {
  if (row.kind === "terms" && row.terms) {
    if (HOST_KEYS.has(row.key))
      return (
        <PortraitStrip
          terms={row.terms}
          resolve={resolveHostPortrait}
          fill={fillPortraits}
          tileMax={150}
        />
      );
    if (row.key === SITE_KEY)
      return (
        <PortraitStrip
          terms={row.terms}
          resolve={resolveSitePortrait}
          tileMax={siteTileMax ?? 120}
          fill={fillPortraits}
        />
      );
    if (row.key === STAGE_KEY || row.key === DIAG_KEY || row.key === INFECTIVE_KEY)
      return (
        <PortraitStrip
          terms={row.terms}
          resolve={resolveStagePortrait}
          fill={fillPortraits}
          tileMax={150}
        />
      );
    if (row.key === ZOONOTIC_KEY)
      return (
        <ZoonoticStrip terms={row.terms} fill={fillPortraits} tileMax={150} />
      );
    return <TermList terms={row.terms} />;
  }
  if (row.key === DISTRIBUTION_KEY && row.text)
    return (
      <DistributionSilhouette
        text={row.text}
        worldwide={row.distributionWorldwide}
        regions={row.distributionRegions}
        bands={row.climateBands}
      />
    );
  if (
    row.key === PPP_KEY &&
    row.pppMin !== undefined &&
    row.pppMax !== undefined
  )
    return <PppGlance min={row.pppMin} max={row.pppMax} />;
  return <>{row.text}</>;
}

export function GlanceFact({
  row,
  refs,
  onCite,
}: {
  row: GlanceRow;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
}) {
  const Icon = glanceIconFor(row);
  const portraitCard = PORTRAIT_KEYS.has(row.key);
  const mapCard = row.key === DISTRIBUTION_KEY;
  const mediaCard = portraitCard || mapCard;
  const fullBleed = HOST_KEYS.has(row.key) || mapCard;
  return (
    <Paper
      component="div"
      variant="outlined"
      sx={{
        display: "grid",
        gridTemplateColumns: mediaCard
          ? "minmax(0, 1fr)"
          : "28px minmax(0, 1fr)",
        gap: 1.25,
        alignItems: "start",
        minWidth: 0,
        px: 1.5,
        py: 1.35,
        borderRadius: 1.5,
        bgcolor: "background.paper",
        gridColumn: fullBleed ? "1 / -1" : undefined,
      }}
    >
      {mediaCard ? null : (
        <Icon
          sx={{
            fontSize: 22,
            mt: "3px",
            color: "primary.main",
            opacity: 0.88,
          }}
          aria-hidden
        />
      )}
      <div>
        <Typography
          component="dt"
          color="text.secondary"
          sx={{ fontSize: "0.88rem", fontWeight: 600, lineHeight: 1.3 }}
        >
          {row.label}
          {row.citeField ? (
            <CiteSup
              field={row.citeField}
              label={row.label}
              refs={refs}
              onCite={onCite}
            />
          ) : null}
        </Typography>
        <Box
          component="dd"
          sx={{
            m: 0,
            mt: mediaCard ? 0.15 : 0.35,
            fontSize: mediaCard ? undefined : "1.08rem",
            lineHeight: 1.4,
          }}
        >
          <GlanceValue row={row} />
        </Box>
      </div>
    </Paper>
  );
}

/** Full-width sheet; bands share the row and tiles grow to fill. */
export function BandSheetPanel({
  rows,
  refs,
  onCite,
}: {
  rows: GlanceRow[];
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
}) {
  return (
    <Paper
      component="div"
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        bgcolor: "background.paper",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "stretch",
          gap: 1.25,
          px: 1.35,
          py: 1.2,
        }}
      >
        {rows.map((row) => (
          <BodyCourseSlot
            key={row.key}
            row={row}
            refs={refs}
            onCite={onCite}
            dense
            fill
            flexGrow={Math.max(
              row.kind === "terms" ? (row.terms?.length ?? 1) : 1,
              1,
            )}
          />
        ))}
      </Box>
    </Paper>
  );
}

/** One outlined sheet: Site | Stages, then full-width PPP. */
export function BodyCoursePanel({
  rows,
  refs,
  onCite,
}: {
  rows: GlanceRow[];
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
}) {
  const site = rows.find((r) => r.key === SITE_KEY);
  const stages = rows.find((r) => r.key === STAGE_KEY);
  const ppp = rows.find((r) => r.key === PPP_KEY);
  const PppIcon = glanceIconFor(
    ppp ?? { key: "pppDays", label: "Prepatent period", citeField: null, kind: "text" },
  );

  return (
    <Paper
      component="div"
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        bgcolor: "background.paper",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {site || stages ? (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "stretch",
            gap: 1.25,
            px: 1.35,
            pt: 1.2,
            pb: ppp ? 0.15 : 1.2,
          }}
        >
          {site ? (
            <BodyCourseSlot
              row={site}
              refs={refs}
              onCite={onCite}
              dense
              fill
              flexGrow={1}
            />
          ) : null}
          {stages ? (
            <BodyCourseSlot
              row={stages}
              refs={refs}
              onCite={onCite}
              dense
              fill
              flexGrow={Math.max(stages.terms?.length ?? 1, 1)}
            />
          ) : null}
        </Box>
      ) : null}
      {ppp ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "28px minmax(0, 1fr)",
            gap: 1.25,
            alignItems: "start",
            px: 1.35,
            pt: 0.85,
            pb: 1.2,
          }}
        >
          <PppIcon
            sx={{
              fontSize: 22,
              mt: "3px",
              color: "primary.main",
              opacity: 0.88,
            }}
            aria-hidden
          />
          <div>
            <Typography
              component="dt"
              color="text.secondary"
              sx={{ fontSize: "0.88rem", fontWeight: 600, lineHeight: 1.3 }}
            >
              {ppp.label}
              {ppp.citeField ? (
                <CiteSup
                  field={ppp.citeField}
                  label={ppp.label}
                  refs={refs}
                  onCite={onCite}
                />
              ) : null}
            </Typography>
            <Box component="dd" sx={{ m: 0, mt: 0.35 }}>
              <GlanceValue row={ppp} />
            </Box>
          </div>
        </Box>
      ) : null}
    </Paper>
  );
}

function BodyCourseSlot({
  row,
  refs,
  onCite,
  siteTileMax,
  dense,
  fill,
  flexGrow = 1,
}: {
  row: GlanceRow;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  siteTileMax?: number;
  /** Parent already padded. */
  dense?: boolean;
  /** Band grows; portraits fill the band. */
  fill?: boolean;
  /** Flex grow weight (e.g. portrait count for equal tile sizes). */
  flexGrow?: number;
}) {
  return (
    <Box
      sx={{
        px: dense ? 0 : 1.5,
        py: dense ? 0 : 1.35,
        minWidth: 0,
        flex: fill ? `${flexGrow} 1 0` : "0 1 auto",
      }}
    >
      <Typography
        component="dt"
        color="text.secondary"
        sx={{ fontSize: "0.88rem", fontWeight: 600, lineHeight: 1.3 }}
      >
        {row.label}
        {row.citeField ? (
          <CiteSup
            field={row.citeField}
            label={row.label}
            refs={refs}
            onCite={onCite}
          />
        ) : null}
      </Typography>
      <Box component="dd" sx={{ m: 0, mt: 0.15 }}>
        <GlanceValue
          row={row}
          siteTileMax={siteTileMax}
          fillPortraits={fill}
        />
      </Box>
    </Box>
  );
}

export function TaxonomyTreeCard({
  nodes,
  groupCue,
  refs,
  onCite,
  onTaxonomyBrowse,
  taxonomyActive,
}: {
  nodes: TaxonomyNode[];
  groupCue: string | null | undefined;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  onTaxonomyBrowse?: (filter: TaxonomyFilter) => void;
  taxonomyActive?: TaxonomyFilter | null;
}) {
  const Icon = glanceIconFor({
    key: "taxonomy",
    label: "Taxonomy",
    citeField: nodes[0]?.field ?? null,
    kind: "text",
    iconCue: groupCue ?? null,
  });
  const groupLabel = groupCue
    ? groupCue.charAt(0).toUpperCase() + groupCue.slice(1)
    : null;
  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        alignItems: "stretch",
        gap: 1.5,
        px: 1.35,
        py: 1.15,
        borderRadius: 1.5,
        bgcolor: "background.paper",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.35,
          alignSelf: "center",
          minWidth: 52,
        }}
      >
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: 1.25,
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(183, 148, 204, 0.14)"
                : "rgba(91, 44, 111, 0.08)",
          }}
        >
          <Icon
            sx={{ fontSize: 26, color: "primary.main", opacity: 0.95 }}
            aria-hidden
          />
        </Box>
        {groupLabel ? (
          <Typography
            color="text.secondary"
            sx={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.02em" }}
          >
            {groupLabel}
          </Typography>
        ) : null}
      </Box>
      <Box
        component="ol"
        sx={{
          m: 0,
          p: 0,
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          flex: "1 1 auto",
          minWidth: 0,
          rowGap: 0.75,
        }}
      >
        {nodes.map((node, i) => (
          <Box
            key={node.field}
            component="li"
            sx={{
              flex: "1 1 0",
              minWidth: 108,
              display: "flex",
              alignItems: "center",
            }}
          >
            {i > 0 ? (
              <Box
                aria-hidden
                sx={{
                  px: 0.85,
                  color: "primary.main",
                  opacity: 0.45,
                  fontSize: "1.15rem",
                  fontWeight: 300,
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                →
              </Box>
            ) : null}
            <Box sx={{ minWidth: 0, py: 0.1, flex: "1 1 auto" }}>
              <Typography
                color="text.secondary"
                sx={{ fontSize: "0.78rem", fontWeight: 600, lineHeight: 1.3 }}
              >
                {node.label}
                <CiteSup
                  field={node.field}
                  label={node.label}
                  refs={refs}
                  onCite={onCite}
                />
              </Typography>
              {onTaxonomyBrowse ? (
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() =>
                    onTaxonomyBrowse({
                      rank: node.field,
                      value: node.value,
                    })
                  }
                  aria-label={
                    taxonomyActive?.rank === node.field &&
                    taxonomyActive.value === node.value
                      ? `Clear ${node.label} filter ${node.value}`
                      : `Show other parasites in ${node.label} ${node.value}`
                  }
                  aria-pressed={
                    taxonomyActive?.rank === node.field &&
                    taxonomyActive.value === node.value
                  }
                  sx={{
                    display: "inline",
                    fontSize: "1.08rem",
                    lineHeight: 1.35,
                    mt: 0.15,
                    fontStyle: "italic",
                    fontWeight: 600,
                    textAlign: "left",
                    color:
                      taxonomyActive?.rank === node.field &&
                      taxonomyActive.value === node.value
                        ? "primary.main"
                        : "text.primary",
                  }}
                >
                  {node.value}
                </Link>
              ) : (
                <Typography
                  sx={{
                    fontSize: "1.08rem",
                    lineHeight: 1.35,
                    mt: 0.15,
                    fontStyle: "italic",
                    fontWeight: 600,
                  }}
                >
                  {node.value}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}


