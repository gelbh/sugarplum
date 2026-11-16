import type { MouseEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { isPlainClick, navigate } from "../../nav/navigate";

export type BoardTileSelect = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  inputLabel: string;
};

export type BoardTileCredit = {
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
};

function withReferral(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set("utm_source", "sugarplum");
    url.searchParams.set("utm_medium", "referral");
    return url.toString();
  } catch {
    return href;
  }
}

type Props = {
  title: string;
  meta?: string | null;
  imageSrc?: string;
  href?: string;
  openLabel?: string;
  create?: boolean;
  onCreate?: () => void;
  moreLabel?: string;
  onMore?: (event: MouseEvent<HTMLButtonElement>) => void;
  select?: BoardTileSelect;
  credit?: BoardTileCredit | null;
  badge?: string | null;
  muted?: boolean;
  accent?: boolean;
  index?: number;
  footer?: ReactNode;
};

export default function BoardTile({
  title,
  meta,
  imageSrc = "",
  href,
  openLabel,
  create,
  onCreate,
  moreLabel,
  onMore,
  select,
  credit,
  badge,
  muted,
  accent,
  index = 0,
  footer,
}: Props) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const plate = (
    <>
      {create ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(91, 44, 111, 0.18)",
            border: "1px dashed",
            borderColor: "primary.main",
          }}
        >
          <Typography
            variant="h3"
            color="primary"
            sx={{ fontWeight: 600, lineHeight: 1 }}
          >
            +
          </Typography>
        </Box>
      ) : (
        <Box
          component="img"
          src={imageSrc}
          alt=""
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, transparent 40%, rgba(15, 5, 14, 0.88) 100%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          p: 1.25,
          zIndex: 1,
        }}
      >
        <Typography
          variant="subtitle1"
          component="h2"
          sx={{
            fontWeight: 700,
            color: accent ? "primary.light" : "#F5F5F5",
            lineHeight: 1.2,
            textShadow: "0 1px 8px rgba(0,0,0,0.55)",
          }}
        >
          {title}
        </Typography>
        {meta ? (
          <Typography
            variant="caption"
            sx={{ color: "rgba(245,245,245,0.72)", display: "block", mt: 0.25 }}
          >
            {meta}
          </Typography>
        ) : null}
        {badge ? (
          <Chip
            size="small"
            color="primary"
            label={badge}
            sx={{ mt: 0.75, height: 22 }}
          />
        ) : null}
        {credit ? (
          <Typography
            variant="caption"
            sx={{ color: "rgba(245,245,245,0.55)", display: "block", mt: 0.5 }}
            onClick={(ev) => ev.stopPropagation()}
          >
            Photo by{" "}
            <Link
              href={withReferral(credit.photographerUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              sx={{ color: "inherit" }}
            >
              {credit.photographerName}
            </Link>
            {" · "}
            <Link
              href={withReferral(credit.photoHtmlUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              sx={{ color: "inherit" }}
            >
              Unsplash
            </Link>
          </Typography>
        ) : null}
      </Box>
    </>
  );

  const shellSx = {
    position: "relative" as const,
    aspectRatio: "3 / 4",
    width: "100%",
    borderRadius: 2,
    overflow: "hidden",
    bgcolor: "#1a0b18",
    opacity: muted ? 0.55 : 1,
    border: 1,
    borderColor: accent ? "primary.main" : "rgba(232, 216, 199, 0.16)",
    borderStyle: create ? "dashed" : "solid",
    transition: reduced
      ? undefined
      : "transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease",
    animation: reduced
      ? undefined
      : `boardPosterIn 420ms ease both`,
    animationDelay: reduced ? undefined : `${Math.min(index, 12) * 40}ms`,
    "@keyframes boardPosterIn": {
      from: { opacity: 0, transform: "translateY(10px)" },
      to: { opacity: muted ? 0.55 : 1, transform: "translateY(0)" },
    },
    ".board-grid:hover &": reduced
      ? undefined
      : { opacity: muted ? 0.4 : 0.55 },
    ".board-grid:hover &:hover, .board-grid:hover &:focus-within": reduced
      ? undefined
      : {
          opacity: 1,
          transform: "scale(1.03)",
          zIndex: 2,
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        },
  };

  const body =
    create && onCreate ? (
      <ButtonBase
        onClick={onCreate}
        focusRipple
        aria-label={openLabel ?? title}
        sx={{ ...shellSx, display: "block", textAlign: "left" }}
      >
        {plate}
      </ButtonBase>
    ) : href && !select ? (
      <Link
        href={href}
        underline="none"
        color="inherit"
        aria-label={openLabel ?? `Open ${title}`}
        onClick={(ev) => {
          if (ev.defaultPrevented || !isPlainClick(ev)) return;
          ev.preventDefault();
          navigate(href);
        }}
        sx={{ ...shellSx, display: "block" }}
      >
        {plate}
      </Link>
    ) : (
      <Box sx={shellSx}>{plate}</Box>
    );

  return (
    <Box sx={{ position: "relative", minWidth: 0 }}>
      {select ? (
        <Checkbox
          checked={select.checked}
          indeterminate={select.indeterminate}
          disabled={select.disabled}
          onChange={select.onChange}
          inputProps={{ "aria-label": select.inputLabel }}
          sx={{
            position: "absolute",
            top: 4,
            left: 4,
            zIndex: 3,
            bgcolor: "rgba(0,0,0,0.35)",
            borderRadius: 1,
          }}
        />
      ) : null}
      {onMore && moreLabel ? (
        <IconButton
          aria-label={moreLabel}
          onClick={onMore}
          size="small"
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 3,
            width: 40,
            height: 40,
            bgcolor: "rgba(0,0,0,0.35)",
            color: "#F5F5F5",
            "&:hover": { bgcolor: "rgba(0,0,0,0.55)" },
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ) : null}
      {body}
      {footer}
    </Box>
  );
}
