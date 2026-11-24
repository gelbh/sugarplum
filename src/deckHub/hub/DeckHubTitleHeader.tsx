import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import type { StoredCoverRow } from "../../api/client";
import { coverPlaceholderColor } from "../../library/board/coverPlaceholder";
import CoverHeroThumb from "../../shared/ui/CoverHeroThumb";
import StageBreadcrumbs, { type StageCrumb } from "../../shared/ui/StageBreadcrumbs";

type Props = {
  title: string;
  cover: StoredCoverRow | null;
  coverKey?: string;
  guest: boolean;
  metaLine: string;
  crumbs?: StageCrumb[];
  spark?: ReactNode;
  onStudy?: () => void;
  exportBusy: boolean;
  exportDisabled: boolean;
  onExportAnki: () => void;
  onRename: () => void;
  onDelete: () => void;
  onChangeCover: () => void;
};

export default function DeckHubTitleHeader({
  title,
  cover,
  coverKey = "deck",
  guest,
  metaLine,
  crumbs = [],
  spark,
  onStudy,
  exportBusy,
  exportDisabled,
  onExportAnki,
  onRename,
  onDelete,
  onChangeCover,
}: Props) {
  const coverSrc = cover?.imageUrl;
  const emptyColor = coverPlaceholderColor(coverKey);

  return (
    <Box
      sx={{
        pb: 1.5,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <StageBreadcrumbs crumbs={crumbs} sx={{ mb: 1.5 }} />

      <Stack
        direction="row"
        spacing={{ xs: 2, sm: 2.5 }}
        sx={{
          alignItems: "flex-start",
          minWidth: 0
        }}>
        <CoverHeroThumb
          src={coverSrc}
          placeholderColor={emptyColor}
          interactive={!guest}
          onChangeCover={onChangeCover}
          ariaLabel={
            cover ? `Change cover for ${title}` : `Add cover for ${title}`
          }
          credit={
            cover?.source === "unsplash"
              ? {
                  photographerName: cover.photographerName,
                  photographerUrl: cover.photographerUrl,
                }
              : null
          }
        />

        <Box sx={{ minWidth: 0, flex: 1, pt: { xs: 0.25, sm: 0.5 } }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "flex-start",
              justifyContent: "space-between"
            }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                component="p"
                sx={{
                  m: 0,
                  mb: 0.75,
                  fontSize: "0.6875rem",
                  fontWeight: 500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "primary.main",
                }}
              >
                Deck hub
              </Typography>
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  m: 0,
                  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                  lineHeight: 1.1,
                  color: "text.primary",
                }}
              >
                {title}
              </Typography>
              {metaLine ? (
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mt: 0.75
                  }}>
                  {metaLine}
                </Typography>
              ) : null}
            </Box>
            <Stack
              direction="row"
              spacing={0.25}
              sx={{
                flexShrink: 0,
                mt: -0.25
              }}>
              <Tooltip title="Rename deck">
                <IconButton
                  size="small"
                  aria-label={`Rename ${title}`}
                  onClick={onRename}
                  sx={{ color: "text.secondary" }}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {!guest ? (
                <Tooltip title={cover ? "Change cover" : "Add cover"}>
                  <IconButton
                    size="small"
                    aria-label={
                      cover
                        ? `Change cover for ${title}`
                        : `Add cover for ${title}`
                    }
                    onClick={onChangeCover}
                    sx={{ color: "text.secondary" }}
                  >
                    <ImageOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              <Tooltip title="Delete deck">
                <IconButton
                  size="small"
                  aria-label={`Delete ${title}`}
                  onClick={onDelete}
                  sx={{ color: "text.secondary" }}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {!guest && (!exportDisabled || exportBusy) ? (
                <Tooltip
                  title={exportBusy ? "Exporting…" : "Download for Anki"}
                >
                  <span>
                    <IconButton
                      size="small"
                      aria-label={`Download ${title} for Anki`}
                      disabled={exportBusy}
                      onClick={onExportAnki}
                      sx={{ color: "text.secondary" }}
                    >
                      <FileDownloadOutlinedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
          </Stack>
          {spark ? <Box sx={{ mt: 1.5 }}>{spark}</Box> : null}
          {onStudy ? (
            <Box sx={{ mt: 1.75 }}>
              <Button
                variant="contained"
                size="medium"
                startIcon={<SchoolOutlinedIcon />}
                onClick={onStudy}
                aria-label="Study"
                sx={{ minWidth: 128 }}
              >
                Study
              </Button>
            </Box>
          ) : null}
        </Box>
      </Stack>
    </Box>
  );
}
