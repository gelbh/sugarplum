import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import AtlasImage from "../hub/AtlasImage";
import EntryPersonalNotes from "./EntryPersonalNotes";
import { FIELD_LABELS, type EntryRefs } from "./entryFields";
import {
  entryLead,
  glanceSections,
  significanceFullRow,
  taxonomyTree,
} from "./entryGlance";
import {
  BandSheetPanel,
  BodyCoursePanel,
  CiteSup,
  GlanceFact,
  TaxonomyTreeCard,
} from "./glanceSheets";
import { type TaxonomyFilter } from "../hub/filter";
import type { AtlasEntryView, AtlasImageView, DatasetFields } from "../types";

type FieldKey = keyof DatasetFields;

type Props = {
  entry: AtlasEntryView;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  /** Browse related parasites by taxonomy rank in the entry rail. */
  onTaxonomyBrowse?: (filter: TaxonomyFilter) => void;
  taxonomyActive?: TaxonomyFilter | null;
  onEdit?: () => void;
  onReset?: () => void;
  onMakeCards?: () => void;
  atlasId?: string;
  onNoteUpdated?: (entry: AtlasEntryView) => void;
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

export default function EntryFacts({
  entry,
  refs,
  onCite,
  onTaxonomyBrowse,
  taxonomyActive,
  onEdit,
  onReset,
  onMakeCards,
  atlasId,
  onNoteUpdated,
}: Props) {
  const lead = entryLead(entry.fields.significance);
  const sections = glanceSections(entry.fields);
  const fullSig = significanceFullRow(
    entry.fields,
    Boolean(lead?.truncated),
  );
  const heroId = entry.images.find((i) => i.isHero)?.id;
  const gallery = entry.images.filter((i) => i.id !== heroId);
  const showActions = Boolean(onEdit || onReset || onMakeCards);
  const [lightbox, setLightbox] = useState<AtlasImageView | null>(null);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {showActions || entry.editedAt ? (
        <Stack
          direction="row"
          sx={{
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center"
          }}>
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
        <Typography sx={{ fontSize: "1.12rem", lineHeight: 1.55 }}>
          {lead.preview}
          <CiteSup
            field="significance"
            label={FIELD_LABELS.significance}
            refs={refs}
            onCite={onCite}
          />
        </Typography>
      ) : null}
      {sections.map((section) => {
        const tree =
          section.id === "taxonomy"
            ? taxonomyTree(entry.fields)
            : null;
        return (
          <Box key={section.id} component="section" aria-label={section.title}>
            <Typography
              sx={{
                color: "text.secondary",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                mb: 1
              }}>
              {section.title}
            </Typography>
            {tree && tree.length > 0 ? (
              <TaxonomyTreeCard
                nodes={tree}
                groupCue={entry.fields.group}
                refs={refs}
                onCite={onCite}
                onTaxonomyBrowse={onTaxonomyBrowse}
                taxonomyActive={taxonomyActive}
              />
            ) : section.id === "hosts" || section.id === "detection" ? (
              <Box component="dl" sx={{ m: 0 }}>
                <BandSheetPanel
                  rows={section.rows}
                  refs={refs}
                  onCite={onCite}
                />
              </Box>
            ) : section.id === "body" ? (
              <Box component="dl" sx={{ m: 0 }}>
                <BodyCoursePanel
                  rows={section.rows}
                  refs={refs}
                  onCite={onCite}
                />
              </Box>
            ) : (
              <Box
                component="dl"
                sx={{
                  m: 0,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "minmax(0, 1fr)",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 1.25,
                }}
              >
                {section.rows.map((row) => (
                  <GlanceFact
                    key={row.key}
                    row={row}
                    refs={refs}
                    onCite={onCite}
                  />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
      {fullSig ? (
        <Box component="section" aria-label="Notes">
          <Typography
            sx={{
              color: "text.secondary",
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              mb: 1
            }}>
            Notes
          </Typography>
          <Box component="dl" sx={{ m: 0 }}>
            <GlanceFact row={fullSig} refs={refs} onCite={onCite} />
          </Box>
        </Box>
      ) : null}
      {atlasId && onNoteUpdated ? (
        <EntryPersonalNotes
          atlasId={atlasId}
          entryId={entry.id}
          personalNote={entry.personalNote}
          onUpdated={onNoteUpdated}
        />
      ) : null}
      {gallery.length > 0 ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 1.5,
            pt: 0.5,
          }}
        >
          {gallery.map((img) => {
            const caption = img.caption ?? IMAGE_ROLE_LABELS[img.role];
            return (
              <Box key={img.id} component="figure" sx={{ m: 0 }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setLightbox(img)}
                  aria-label={`Enlarge ${caption}`}
                  sx={{
                    display: "block",
                    width: "100%",
                    p: 0,
                    m: 0,
                    border: 0,
                    bgcolor: "transparent",
                    cursor: "zoom-in",
                    borderRadius: 1,
                    textAlign: "left",
                    "&:focus-visible": {
                      outline: 2,
                      outlineOffset: 2,
                      outlineColor: "primary.main",
                    },
                  }}
                >
                  <AtlasImage
                    image={img}
                    ratio="4 / 3"
                    fit="contain"
                    sx={{
                      borderRadius: 1,
                      border: 1,
                      borderColor: "divider",
                    }}
                  />
                </Box>
                <Box component="figcaption" sx={{ px: 0.25, py: 0.75 }}>
                  <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    {caption}
                  </Typography>
                  <Typography
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.72rem"
                    }}>
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
            );
          })}
        </Box>
      ) : null}

      <Dialog
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        maxWidth="lg"
        fullWidth
        aria-label={
          lightbox
            ? `Enlarged ${lightbox.caption ?? IMAGE_ROLE_LABELS[lightbox.role]}`
            : undefined
        }
      >
        <IconButton
          aria-label="Close"
          onClick={() => setLightbox(null)}
          sx={{ position: "absolute", right: 8, top: 8, zIndex: 1 }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent sx={{ pt: 5 }}>
          {lightbox ? (
            <>
              <AtlasImage
                image={lightbox}
                fit="contain"
                sx={{
                  width: "100%",
                  height: { xs: "min(55vh, 420px)", sm: "min(70vh, 640px)" },
                  aspectRatio: "unset",
                  borderRadius: 1,
                  border: 1,
                  borderColor: "divider",
                }}
              />
              <Typography sx={{ mt: 1.5, fontWeight: 600, fontSize: "0.95rem" }}>
                {lightbox.caption ?? IMAGE_ROLE_LABELS[lightbox.role]}
              </Typography>
              <Typography
                sx={{
                  color: "text.secondary",
                  fontSize: "0.82rem"
                }}>
                <Link
                  href={lightbox.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="inherit"
                >
                  {lightbox.credit}
                </Link>
                , {lightbox.license}
              </Typography>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
