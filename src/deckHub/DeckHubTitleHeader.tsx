import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import type { StoredCoverRow } from "../api/client";
import { coverPlaceholderSrc } from "../library/board/coverPlaceholder";
import StageBreadcrumbs, { type StageCrumb } from "../library/StageBreadcrumbs";

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
  const coverSrc = cover?.imageUrl ?? coverPlaceholderSrc(coverKey);

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
        alignItems="flex-start"
        sx={{ minWidth: 0 }}
      >
        <Stack
          spacing={0.75}
          alignItems="stretch"
          sx={{ flexShrink: 0, width: { xs: 104, sm: 132 } }}
        >
          <Box
            component={!guest ? ButtonBase : "div"}
            {...(!guest
              ? {
                  focusRipple: true,
                  onClick: onChangeCover,
                  "aria-label": cover
                    ? `Change cover for ${title}`
                    : `Add cover for ${title}`,
                }
              : {})}
            sx={{
              position: "relative",
              width: "100%",
              aspectRatio: "3 / 4",
              borderRadius: 2,
              overflow: "hidden",
              border: 1,
              borderColor: "rgba(232, 216, 199, 0.16)",
              bgcolor: "#1a0b18",
              boxShadow: "0 14px 36px rgba(0,0,0,0.42)",
              textAlign: "left",
              display: "block",
              transition: "transform 180ms ease, box-shadow 180ms ease",
              "@media (prefers-reduced-motion: reduce)": {
                transition: "none",
              },
              ...(!guest
                ? {
                    "&:hover, &:focus-visible": {
                      transform: "translateY(-2px) scale(1.02)",
                      boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
                    },
                    "@media (prefers-reduced-motion: reduce)": {
                      "&:hover, &:focus-visible": {
                        transform: "none",
                      },
                    },
                  }
                : {}),
            }}
          >
            <Box
              component="img"
              src={coverSrc}
              alt=""
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, transparent 42%, rgba(15, 5, 14, 0.82) 100%)",
                pointerEvents: "none",
              }}
            />
          </Box>
          {cover?.source === "unsplash" ? (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                display: "block",
                lineHeight: 1.35,
                px: 0.25,
              }}
            >
              Photo by{" "}
              <Link
                href={cover.photographerUrl}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ color: "inherit" }}
              >
                {cover.photographerName}
              </Link>
            </Typography>
          ) : null}
        </Stack>

        <Box sx={{ minWidth: 0, flex: 1, pt: { xs: 0.25, sm: 0.5 } }}>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={1}
          >
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
                  color="text.secondary"
                  sx={{ mt: 0.75 }}
                >
                  {metaLine}
                </Typography>
              ) : null}
            </Box>
            <Stack
              direction="row"
              spacing={0.25}
              flexShrink={0}
              sx={{ mt: -0.25 }}
            >
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
                  <DeleteOutlineIcon fontSize="small" />
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
