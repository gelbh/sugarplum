import type { ReactNode } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AtlasImage from "./AtlasImage";
import { FIELD_LABELS, type EntryRefs } from "./entryFields";
import {
  entryLead,
  glanceRows,
  moreFactKeys,
  type GlanceRow,
} from "./entryGlance";
import TermList from "./TermList";
import type { AtlasEntryView, DatasetFields } from "./types";

type FieldKey = keyof DatasetFields;

type Props = {
  entry: AtlasEntryView;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  onEdit?: () => void;
  onReset?: () => void;
  onMakeCards?: () => void;
  /** When true, only the More accordion (facts + gallery). */
  moreOnly?: boolean;
  /** When true, only glance + actions (no More). */
  glanceOnly?: boolean;
};

const IMAGE_ROLE_LABELS: Record<
  AtlasEntryView["images"][number]["role"],
  string
> = {
  adult: "Adult",
  egg_oocyst: "Egg or oocyst",
  larva: "Larva",
  lifecycle_diagram: "Lifecycle diagram",
  lesion: "Lesion",
  host: "Host",
  other: "Image",
};

function moreRows(
  f: DatasetFields,
  leadTruncated: boolean,
): [FieldKey, ReactNode][] {
  const terms = (list: string[]) =>
    list.length > 0 ? <TermList terms={list} /> : null;
  const out: [FieldKey, ReactNode][] = [];
  for (const key of moreFactKeys()) {
    if (key === "significance") {
      if (!f.significance) continue;
      if (!leadTruncated) continue;
      out.push(["significance", f.significance]);
      continue;
    }
    if (key === "paratenicHosts") {
      const v = terms(f.paratenicHosts);
      if (v) out.push([key, v]);
      continue;
    }
    if (key === "onHostStages") {
      const v = terms(f.onHostStages);
      if (v) out.push([key, v]);
      continue;
    }
    if (key === "vectorRole" && f.vectorRole) out.push([key, f.vectorRole]);
    else if (key === "distribution" && f.distribution)
      out.push([key, f.distribution]);
    else if (key === "phylum" && f.phylum) out.push([key, f.phylum]);
    else if (key === "order" && f.order) out.push([key, f.order]);
  }
  return out;
}

function CiteSup({
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

function GlanceValue({ row }: { row: GlanceRow }) {
  if (row.kind === "terms" && row.terms)
    return <TermList terms={row.terms} />;
  return <>{row.text}</>;
}

export default function EntryFacts({
  entry,
  refs,
  onCite,
  onEdit,
  onReset,
  onMakeCards,
  moreOnly = false,
  glanceOnly = false,
}: Props) {
  const lead = entryLead(entry.fields.significance);
  const rows = glanceRows(entry.fields);
  const extras = moreRows(entry.fields, Boolean(lead?.truncated));
  const heroId = entry.images.find((i) => i.isHero)?.id;
  const gallery = entry.images.filter((i) => i.id !== heroId);
  const showActions = Boolean(onEdit || onReset || onMakeCards);

  const glance = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {showActions || entry.editedAt ? (
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          {entry.editedAt ? (
            <Chip label="Edited" size="small" variant="outlined" />
          ) : null}
          {onMakeCards ? (
            <Button variant="contained" size="small" onClick={onMakeCards}>
              Make cards
            </Button>
          ) : null}
          {onEdit ? (
            <Button variant="text" size="small" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {onReset ? (
            <Button variant="text" size="small" onClick={onReset}>
              Reset to original
            </Button>
          ) : null}
        </Stack>
      ) : null}
      {lead ? (
        <Typography sx={{ fontSize: "1rem", lineHeight: 1.55 }}>
          {lead.preview}
          <CiteSup
            field="significance"
            label={FIELD_LABELS.significance}
            refs={refs}
            onCite={onCite}
          />
        </Typography>
      ) : null}
      {rows.length > 0 ? (
        <Box
          component="dl"
          sx={{
            m: 0,
            display: "grid",
            gap: 1.25,
            maxWidth: 560,
          }}
        >
          {rows.map((row) => (
            <div key={row.key}>
              <Typography
                component="dt"
                color="text.secondary"
                sx={{ fontSize: "0.76rem", fontWeight: 600 }}
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
              <Typography
                component="dd"
                sx={{ m: 0, fontSize: "0.92rem", lineHeight: 1.4 }}
              >
                <GlanceValue row={row} />
              </Typography>
            </div>
          ))}
        </Box>
      ) : null}
    </Box>
  );

  const more = (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        bgcolor: "transparent",
        "&:before": { display: "none" },
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 0, minHeight: 44 }}
      >
        <Typography sx={{ fontWeight: 600, fontSize: "0.9rem" }}>
          More
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        {extras.length > 0 ? (
          <Box
            component="dl"
            sx={{ m: 0, mb: 2, display: "grid", gap: 1.25, maxWidth: 560 }}
          >
            {extras.map(([key, value]) => (
              <div key={key}>
                <Typography
                  component="dt"
                  color="text.secondary"
                  sx={{ fontSize: "0.76rem", fontWeight: 600 }}
                >
                  {FIELD_LABELS[key]}
                  <CiteSup
                    field={key}
                    label={FIELD_LABELS[key]}
                    refs={refs}
                    onCite={onCite}
                  />
                </Typography>
                <Typography
                  component="dd"
                  sx={{ m: 0, fontSize: "0.92rem", lineHeight: 1.4 }}
                >
                  {value}
                </Typography>
              </div>
            ))}
          </Box>
        ) : null}
        {gallery.length > 0 ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 1.5,
            }}
          >
            {gallery.map((img) => (
              <Box key={img.id} component="figure" sx={{ m: 0 }}>
                <AtlasImage
                  image={img}
                  ratio="4 / 3"
                  sx={{ borderRadius: 1, border: 1, borderColor: "divider" }}
                />
                <Box component="figcaption" sx={{ px: 0.25, py: 0.75 }}>
                  <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    {img.caption ?? IMAGE_ROLE_LABELS[img.role]}
                  </Typography>
                  <Typography
                    color="text.secondary"
                    sx={{ fontSize: "0.72rem" }}
                  >
                    <Link
                      href={img.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      color="inherit"
                    >
                      {img.credit}
                    </Link>
                    , {img.license}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ fontSize: "0.84rem" }}>
            No additional images yet.
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );

  if (moreOnly) return more;
  if (glanceOnly) return glance;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
      {glance}
      {more}
    </Box>
  );
}
