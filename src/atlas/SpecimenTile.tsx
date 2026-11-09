import { useEffect, useRef, ViewTransition, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AtlasImage, { heroImage } from "./AtlasImage";
import { hostSummary, pppLabel, termLabel } from "./filter";
import { atlasHeroName } from "./paths";
import TermList from "./TermList";
import type { AtlasEntryView } from "./types";

type Props = {
  entry: AtlasEntryView;
  expanded: boolean;
  dimmed: boolean;
  staggerIndex?: number;
  onToggle: () => void;
  onOpen: () => void;
  onEdit?: () => void;
};

const IMAGE_RATIO = "6 / 5";
const STAGGER_CAP = 12;

function findItAs(entry: AtlasEntryView): string | null {
  const { diagnosticStage, diagnosticTests } = entry.fields;
  const test = diagnosticTests[0]?.name ?? null;
  if (diagnosticStage && test)
    return `${termLabel(diagnosticStage)}, by ${test}`;
  return diagnosticStage ? termLabel(diagnosticStage) : test && termLabel(test);
}

export default function SpecimenTile({
  entry,
  expanded,
  dimmed,
  staggerIndex,
  onToggle,
  onOpen,
  onEdit,
}: Props) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(expanded);

  // Move focus into the expanded tile and back to its toggle when it closes.
  useEffect(() => {
    if (expanded) closeRef.current?.focus();
    // Only reclaim focus it lost: opening another tile already moved it there.
    else if (wasExpanded.current && document.activeElement === document.body)
      toggleRef.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);

  const hero = heroImage(entry);
  const { fields } = entry;
  const definitive = hostSummary(fields.definitiveHosts, 2);
  const titleId = `atlas-tile-${entry.id}`;

  if (!expanded) {
    return (
      <ButtonBase
        ref={toggleRef}
        onClick={onToggle}
        aria-expanded={false}
        focusRipple
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          textAlign: "left",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
          minWidth: 0,
          transition: "border-color 180ms ease",
          ...(staggerIndex !== undefined && {
            "@keyframes atlasTileUp": {
              from: { opacity: 0, transform: "translateY(8px)" },
              to: { opacity: 1, transform: "none" },
            },
            animation: `atlasTileUp 360ms cubic-bezier(0.2, 0, 0, 1) ${
              Math.min(staggerIndex, STAGGER_CAP) * 35
            }ms both`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }),
          "&:hover": {
            borderColor: (t) => alpha(t.palette.primary.main, 0.45),
          },
        }}
      >
        <ViewTransition name={atlasHeroName(entry.id)} share="atlas-morph">
          <AtlasImage
            image={hero}
            ratio={IMAGE_RATIO}
            sx={{
              opacity: dimmed ? 0.45 : 1,
              transition: "opacity 220ms ease",
            }}
          />
        </ViewTransition>
        <Box sx={{ px: 1.25, pt: 1, pb: 1.25, minWidth: 0 }}>
          <Typography
            sx={{
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "0.9rem",
              lineHeight: 1.25,
            }}
          >
            {entry.canonicalName}
          </Typography>
          {definitive ? (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ fontSize: "0.8rem", mt: 0.25 }}
            >
              {definitive}
            </Typography>
          ) : null}
        </Box>
      </ButtonBase>
    );
  }

  const rows: [string, ReactNode][] = [
    ["Hosts", <TermList terms={fields.definitiveHosts} max={4} />],
    ["Intermediate", <TermList terms={fields.intermediateHosts} max={3} />],
    ["Site", fields.majorOrgan && termLabel(fields.majorOrgan)],
    ["PPP", pppLabel(fields.pppDays)],
    ["Find it as", findItAs(entry)],
  ];

  return (
    <Box
      role="group"
      aria-labelledby={titleId}
      sx={{
        gridColumn: { xs: "1 / -1", sm: "span 2", md: "span 3" },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 2fr) minmax(0, 3fr)" },
        bgcolor: "background.paper",
        border: 1,
        borderColor: (t) => alpha(t.palette.primary.main, 0.45),
        borderRadius: 2,
        overflow: "hidden",
        "@keyframes atlasTileIn": {
          from: { opacity: 0, transform: "scale(0.98)" },
          to: { opacity: 1, transform: "none" },
        },
        animation: "atlasTileIn 220ms ease-out",
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      }}
    >
      <ViewTransition name={atlasHeroName(entry.id)} share="atlas-morph">
        <AtlasImage
          image={hero}
          ratio={IMAGE_RATIO}
          sx={{
            height: { md: "100%" },
            aspectRatio: { xs: "16 / 9", md: "auto" },
          }}
        />
      </ViewTransition>
      <Box sx={{ p: 2, minWidth: 0, position: "relative" }}>
        <IconButton
          ref={closeRef}
          size="small"
          aria-label={`Close ${entry.canonicalName}`}
          onClick={onToggle}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "text.secondary",
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <Stack direction="row" alignItems="center" gap={1} sx={{ pr: 4 }}>
          <Typography
            id={titleId}
            component="h3"
            sx={{
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "1.3rem",
              lineHeight: 1.15,
            }}
          >
            {entry.canonicalName}
          </Typography>
          {entry.editedAt ? (
            <Chip label="Edited" size="small" variant="outlined" />
          ) : null}
        </Stack>
        {entry.commonName ? (
          <Typography variant="body2" color="text.secondary">
            {entry.commonName}
          </Typography>
        ) : null}
        <Box
          component="dl"
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 1.5,
            rowGap: 0.5,
            my: 1.5,
            fontSize: "0.86rem",
            "& dt": { color: "text.secondary" },
            "& dd": { m: 0, fontWeight: 600 },
          }}
        >
          {rows
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <Box key={label} sx={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </Box>
            ))}
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="contained" size="small" onClick={onOpen}>
            Open lifecycle
          </Button>
          {onEdit ? (
            <Button variant="outlined" size="small" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
