import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { type EntryRefs } from "./entryFields";
import type { GlanceRow } from "./entryGlance";
import DistributionSilhouette from "../hub/DistributionSilhouette";
import PppGlance from "./PppGlance";
import { glanceIconFor } from "./glanceIcons";
import { resolveHostPortrait } from "../hub/hostPortraits";
import { resolveSitePortrait } from "../hub/sitePortraits";
import { resolveStagePortrait } from "../hub/stagePortraits";
import {
  resolveZoonoticPortrait,
  zoonoticPortraitLabel,
} from "../hub/zoonoticPortraits";
import TermList from "./TermList";
import { isTaxonTerm, termLabel } from "../hub/filter";
import type { DatasetFields } from "../types";

export const HOST_KEYS = new Set([
  "definitiveHosts",
  "intermediateHosts",
  "paratenicHosts",
]);
export const SITE_KEY = "majorOrgan";
export const STAGE_KEY = "onHostStages";
export const DIAG_KEY = "diagnosticStage";
export const INFECTIVE_KEY = "infective";
export const ZOONOTIC_KEY = "zoonotic";
export const DISTRIBUTION_KEY = "distribution";
export const PPP_KEY = "pppDays";
const PAIR_PORTRAIT_KEYS = new Set([
  SITE_KEY,
  STAGE_KEY,
  DIAG_KEY,
  INFECTIVE_KEY,
  ZOONOTIC_KEY,
]);
export const PORTRAIT_KEYS = new Set([...HOST_KEYS, ...PAIR_PORTRAIT_KEYS]);

export type FieldKey = keyof DatasetFields;

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
              maxWidth: fill ? tileMax : Math.min(tileMax, 120),
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

export function GlanceValue({
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
        <PortraitStrip
          terms={row.terms}
          resolve={resolveZoonoticPortrait}
          labelFor={zoonoticPortraitLabel}
          fill={fillPortraits}
          tileMax={150}
        />
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
          sx={{
            color: "text.secondary",
            fontSize: "0.88rem",
            fontWeight: 600,
            lineHeight: 1.3
          }}>
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
