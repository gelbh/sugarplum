import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AtlasImage from "../hub/AtlasImage";
import type { EditSectionId } from "../mutate/entryPatch";
import EntryPersonalNotes from "./EntryPersonalNotes";
import { FIELD_LABELS, type EntryRefs } from "./entryFields";
import {
  entryLead,
  glanceSections,
  SIGNIFICANCE_GLANCE,
  significanceFullRow,
  splitGlanceForMobile,
  taxonomyTree,
  type GlanceSection,
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
  /** No section: the Edit button. A section: a glance band pencil. */
  onEdit?: (section?: EditSectionId) => void;
  /** Drop one per-field override (glance "Reset"). */
  onResetField?: (field: FieldKey) => void;
  onReset?: () => void;
  onMakeCards?: () => void;
  atlasId?: string;
  onNoteUpdated?: (entry: AtlasEntryView) => void;
  /** Test override for `breakpoints.down("md")`. */
  mobile?: boolean;
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

const SECTION_LABEL_SX = {
  color: "text.secondary",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
} as const;

export default function EntryFacts({
  entry,
  refs,
  onCite,
  onTaxonomyBrowse,
  taxonomyActive,
  onEdit,
  onResetField,
  onReset,
  onMakeCards,
  atlasId,
  onNoteUpdated,
  mobile: mobileProp,
}: Props) {
  const mobileMq = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const mobile = mobileProp ?? mobileMq;
  const lead = entryLead(entry.fields.significance);
  const allSections = glanceSections(entry.fields);
  const { primary, more } = mobile
    ? splitGlanceForMobile(allSections)
    : { primary: allSections, more: [] as GlanceSection[] };
  const fullSig = significanceFullRow(entry.fields, Boolean(lead?.truncated));
  const heroId = entry.images.find((i) => i.isHero)?.id;
  const gallery = entry.images.filter((i) => i.id !== heroId);
  const showActions = Boolean(onEdit || onReset || onMakeCards);
  const [lightbox, setLightbox] = useState<AtlasImageView | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Older cached views and test fixtures may predate editedFields.
  const editedSet = new Set(entry.editedFields ?? []);
  // Edited fields whose band does not render still need a Reset on the page.
  const shownFields = new Set<FieldKey>(allSections.flatMap((s) => s.fields));
  if (lead) SIGNIFICANCE_GLANCE.fields.forEach((k) => shownFields.add(k));
  const orphanEdited = [...editedSet].filter((k) => !shownFields.has(k));

  const editedMarks = (fields: FieldKey[]): ReactNode =>
    fields
      .filter((k) => editedSet.has(k))
      .map((key) => (
        <Stack
          key={key}
          direction="row"
          sx={{ alignItems: "center", gap: 0.25 }}
        >
          <Chip
            size="small"
            variant="outlined"
            label={`Edited: ${FIELD_LABELS[key]}`}
          />
          {onResetField ? (
            <Button
              size="small"
              variant="text"
              aria-label={`Reset ${FIELD_LABELS[key]}`}
              onClick={() => onResetField(key)}
              sx={{ minWidth: 0 }}
            >
              Reset
            </Button>
          ) : null}
        </Stack>
      ));

  const sectionHeading = (
    title: string,
    meta: Pick<GlanceSection, "fields" | "editSection">,
  ) => (
    <Stack
      direction="row"
      sx={{ alignItems: "center", gap: 0.75, mb: 1, flexWrap: "wrap" }}
    >
      <Typography sx={SECTION_LABEL_SX}>{title}</Typography>
      {editedMarks(meta.fields)}
      {onEdit ? (
        <IconButton
          size="small"
          aria-label={`Edit ${title}`}
          onClick={() => onEdit(meta.editSection)}
          sx={{ ml: "auto" }}
        >
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      ) : null}
    </Stack>
  );

  const renderSection = (section: GlanceSection): ReactNode => {
    const tree = section.id === "taxonomy" ? taxonomyTree(entry.fields) : null;
    return (
      <Box key={section.id} component="section" aria-label={section.title}>
        {sectionHeading(section.title, section)}
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
            <BandSheetPanel rows={section.rows} refs={refs} onCite={onCite} />
          </Box>
        ) : section.id === "body" ? (
          <Box component="dl" sx={{ m: 0 }}>
            <BodyCoursePanel rows={section.rows} refs={refs} onCite={onCite} />
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
              <GlanceFact key={row.key} row={row} refs={refs} onCite={onCite} />
            ))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {showActions || entry.editedAt ? (
        <Stack
          direction="row"
          sx={{
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {entry.editedAt ? (
            <Chip label="Edited" size="small" variant="outlined" />
          ) : null}
          {onMakeCards ? (
            <Button variant="contained" size="small" onClick={onMakeCards}>
              Make cards
            </Button>
          ) : null}
          {onEdit ? (
            <Button variant="text" size="small" onClick={() => onEdit()}>
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
      {orphanEdited.length > 0 ? (
        <Stack
          aria-label="Edited fields"
          direction="row"
          sx={{ alignItems: "center", gap: 0.75, flexWrap: "wrap" }}
        >
          {editedMarks(orphanEdited)}
        </Stack>
      ) : null}
      {lead ? (
        <Box component="section" aria-label="Summary">
          <Typography sx={{ fontSize: "1.12rem", lineHeight: 1.55 }}>
            {lead.preview}
            <CiteSup
              field="significance"
              label={FIELD_LABELS.significance}
              refs={refs}
              onCite={onCite}
            />
          </Typography>
          {!fullSig && editedSet.has("significance") ? (
            <Stack
              direction="row"
              sx={{ alignItems: "center", gap: 0.75, flexWrap: "wrap" }}
            >
              {editedMarks(SIGNIFICANCE_GLANCE.fields)}
            </Stack>
          ) : null}
        </Box>
      ) : null}
      {primary.map(renderSection)}
      {more.length > 0 ? (
        <>
          <Button
            variant="text"
            size="small"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="atlas-glance-more"
            sx={{ alignSelf: "flex-start", minHeight: 44 }}
          >
            {moreOpen ? "Less facts" : "More facts"}
          </Button>
          <Collapse in={moreOpen} unmountOnExit>
            <Box id="atlas-glance-more">{more.map(renderSection)}</Box>
          </Collapse>
        </>
      ) : null}
      {fullSig ? (
        <Box component="section" aria-label="Notes">
          {sectionHeading("Notes", SIGNIFICANCE_GLANCE)}
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
                      fontSize: "0.72rem",
                    }}
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
              <Typography
                sx={{ mt: 1.5, fontWeight: 600, fontSize: "0.95rem" }}
              >
                {lightbox.caption ?? IMAGE_ROLE_LABELS[lightbox.role]}
              </Typography>
              <Typography
                sx={{
                  color: "text.secondary",
                  fontSize: "0.82rem",
                }}
              >
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
