import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AtlasImage from "./AtlasImage";
import { termLabel } from "./filter";
import { FIELD_LABELS, ZOONOTIC_LABELS, type EntryRefs } from "./entryFields";
import TermList from "./TermList";
import type { AtlasEntryView, DatasetFields } from "./types";

type FieldKey = keyof DatasetFields;

type Props = {
  entry: AtlasEntryView;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  onEdit?: () => void;
  onReset?: () => void;
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

function factRows(f: DatasetFields): [FieldKey, ReactNode][] {
  const terms = (list: string[]) =>
    list.length > 0 ? <TermList terms={list} /> : null;
  return [
    ["definitiveHosts", terms(f.definitiveHosts)],
    ["intermediateHosts", terms(f.intermediateHosts)],
    ["paratenicHosts", terms(f.paratenicHosts)],
    ["vectorRole", f.vectorRole],
    ["majorOrgan", f.majorOrgan && termLabel(f.majorOrgan)],
    ["onHostStages", terms(f.onHostStages)],
    ["zoonotic", f.zoonotic && ZOONOTIC_LABELS[f.zoonotic]],
    ["distribution", f.distribution],
    ["significance", f.significance],
    ["phylum", f.phylum],
    ["order", f.order],
  ];
}

export default function EntryFacts({
  entry,
  refs,
  onCite,
  onEdit,
  onReset,
}: Props) {
  const rows = factRows(entry.fields).filter(([, v]) => v !== null && v !== "");
  const showActions = Boolean(onEdit || onReset);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
      {showActions || entry.editedAt ? (
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          {entry.editedAt ? (
            <Chip label="Edited" size="small" variant="outlined" />
          ) : null}
          {onEdit ? (
            <Button variant="outlined" size="small" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {onReset ? (
            <Button variant="outlined" size="small" onClick={onReset}>
              Reset to original
            </Button>
          ) : null}
        </Stack>
      ) : null}
      <Paper variant="outlined" sx={{ px: 2.25, py: 2 }}>
        <Box
          component="dl"
          sx={{
            m: 0,
            mb: -1.25,
            columnWidth: { xs: "auto", sm: 240 },
            columnGap: 4,
            "& > div": { breakInside: "avoid", pb: 1.25 },
          }}
        >
          {rows.map(([key, value]) => {
            const cited = refs.byField.get(key) ?? [];
            return (
              <div key={key}>
                <Typography
                  component="dt"
                  color="text.secondary"
                  sx={{ fontSize: "0.76rem", fontWeight: 600 }}
                >
                  {FIELD_LABELS[key]}
                  {cited.length > 0 ? (
                    <Link
                      component="button"
                      type="button"
                      onClick={() => onCite(key)}
                      underline="hover"
                      aria-label={`Sources for ${FIELD_LABELS[key]}: ${cited.join(", ")}`}
                      sx={{
                        ml: 0.25,
                        px: 0.25,
                        fontSize: "0.68rem",
                        verticalAlign: "super",
                        // A real line box keeps the superscript hittable; negative margin holds the row height.
                        lineHeight: 1,
                        my: "-0.5em",
                        fontWeight: 700,
                      }}
                    >
                      {cited.join(",")}
                    </Link>
                  ) : null}
                </Typography>
                <Typography
                  component="dd"
                  sx={{ m: 0, fontSize: "0.92rem", lineHeight: 1.4 }}
                >
                  {value}
                </Typography>
              </div>
            );
          })}
        </Box>
      </Paper>

      {entry.images.length > 0 ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 1,
          }}
        >
          {entry.images.map((img) => (
            <Paper
              key={img.id}
              component="figure"
              variant="outlined"
              sx={{ m: 0, overflow: "hidden" }}
            >
              <AtlasImage image={img} ratio="4 / 3" />
              <Box component="figcaption" sx={{ px: 1, py: 0.75 }}>
                <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  {img.caption ?? IMAGE_ROLE_LABELS[img.role]}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: "0.72rem" }}>
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
            </Paper>
          ))}
        </Box>
      ) : (
        <Typography
          color="text.secondary"
          sx={{ fontSize: "0.84rem", px: 0.5 }}
        >
          No images yet. Each image will show its credit and licence here.
        </Typography>
      )}
    </Box>
  );
}
