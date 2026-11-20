import { useEffect, useRef, useState, ViewTransition, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AtlasImage, { heroImage } from "../hub/AtlasImage";
import { entryTitles } from "./entryTitles";
import { TIER_LABELS, hostSummary, pppLabel, termLabel } from "../hub/filter";
import { atlasHeroName } from "../paths";
import MarkImportantControl from "./MarkImportantControl";
import NotInPackChip from "../hub/NotInPackChip";
import TermList from "./TermList";
import type { AtlasEntryView } from "../types";

type Props = {
  entry: AtlasEntryView;
  expanded: boolean;
  dimmed: boolean;
  staggerIndex?: number;
  onToggle: () => void;
  onOpen: () => void;
  onEdit?: () => void;
  atlasId?: string;
  onFocusUpdated?: (entry: AtlasEntryView) => void;
  /** Pack-hidden entry shown through Show hidden or search. */
  notInPack?: boolean;
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

function FocusBadge({
  entry,
  atlasId,
  onFocusUpdated,
}: {
  entry: AtlasEntryView;
  atlasId?: string;
  onFocusUpdated?: (entry: AtlasEntryView) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (entry.tier !== "key" && entry.tier !== "frequent") return null;
  return (
    <>
      <Chip
        label={TIER_LABELS[entry.tier]}
        size="small"
        color={entry.tier === "key" ? "primary" : "default"}
        variant="outlined"
        onClick={(ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          setAnchor(ev.currentTarget);
        }}
        sx={{
          fontWeight: 600,
          bgcolor: "background.paper",
          height: 22,
          "& .MuiChip-label": { px: 0.75 },
        }}
      />
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 280 } } }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {TIER_LABELS[entry.tier]}
        </Typography>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          {entry.reason ?? "No Focus reason"}
        </Typography>
        {entry.focusMaterialIds.length > 0 ? (
          <Stack component="ul" spacing={0.25} sx={{ m: 0, mt: 1, pl: 0, listStyle: "none" }}>
            {entry.focusMaterialIds.map((id) => (
              <Typography
                key={id}
                component="li"
                variant="caption"
                sx={{ fontFamily: "ui-monospace, monospace" }}
              >
                {id}
              </Typography>
            ))}
          </Stack>
        ) : null}
        {atlasId && onFocusUpdated ? (
          <Box
            sx={{ mt: 1.25 }}
            onClick={(ev) => {
              ev.stopPropagation();
            }}
          >
            <MarkImportantControl
              atlasId={atlasId}
              entry={entry}
              onUpdated={onFocusUpdated}
            />
          </Box>
        ) : null}
      </Popover>
    </>
  );
}

export default function SpecimenTile({
  entry,
  expanded,
  dimmed,
  staggerIndex,
  onToggle,
  onOpen,
  onEdit,
  atlasId,
  onFocusUpdated,
  notInPack = false,
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
  const titles = entryTitles(entry);
  const { fields } = entry;
  const definitive = hostSummary(fields.definitiveHosts, 2);
  const titleId = `atlas-tile-${entry.id}`;
  const focusBadge = (
    <FocusBadge
      entry={entry}
      atlasId={atlasId}
      onFocusUpdated={onFocusUpdated}
    />
  );

  if (!expanded) {
    return (
      <Box
        sx={{ position: "relative", minWidth: 0, opacity: notInPack ? 0.6 : 1 }}
      >
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
            width: "100%",
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
                fontWeight: 600,
                fontSize: "0.9rem",
                lineHeight: 1.25,
              }}
            >
              {titles.primary}
            </Typography>
            {titles.scientific ? (
              <Typography
                variant="body2"
                noWrap
                sx={{
                  color: "text.secondary",
                  fontSize: "0.75rem",
                  mt: 0.15,
                  fontStyle: "italic"
                }}>
                {titles.scientific}
              </Typography>
            ) : null}
            {definitive ? (
              <Typography
                variant="body2"
                noWrap
                sx={{
                  color: "text.secondary",
                  fontSize: "0.8rem",
                  mt: 0.25
                }}>
                {definitive}
              </Typography>
            ) : null}
            {notInPack ? (
              <Box sx={{ mt: 0.75 }}>
                <NotInPackChip />
              </Box>
            ) : null}
          </Box>
        </ButtonBase>
        {entry.tier === "key" || entry.tier === "frequent" ? (
          <Box sx={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}>
            {focusBadge}
          </Box>
        ) : null}
      </Box>
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
          aria-label={`Close ${titles.primary}`}
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
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            pr: 4
          }}>
          <Typography
            id={titleId}
            component="h3"
            sx={{
              fontWeight: 600,
              fontSize: "1.3rem",
              lineHeight: 1.15,
            }}
          >
            {titles.primary}
          </Typography>
          {focusBadge}
          {entry.editedAt ? (
            <Chip label="Edited" size="small" variant="outlined" />
          ) : null}
          {notInPack ? <NotInPackChip /> : null}
        </Stack>
        {titles.scientific ? (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontStyle: "italic"
            }}>
            {titles.scientific}
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
        <Stack
          direction="row"
          sx={{
            gap: 1,
            flexWrap: "wrap"
          }}>
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
