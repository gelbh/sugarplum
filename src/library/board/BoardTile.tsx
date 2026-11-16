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
  /** Corner pill on the poster (e.g. drafts waiting for review). */
  notice?: string | null;
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
  notice,
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
            background:
              "radial-gradient(ellipse at 50% 38%, rgba(91, 44, 111, 0.42) 0%, rgba(26, 11, 24, 0.92) 68%, #12070f 100%)",
          }}
        />
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
      {create ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pb: 5,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: "rgba(232, 216, 199, 0.28)",
              bgcolor: "rgba(91, 44, 111, 0.35)",
              boxShadow: "0 0 0 8px rgba(91, 44, 111, 0.12)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                fontSize: "1.75rem",
                lineHeight: 1,
                color: "primary.light",
                fontWeight: 400,
              }}
            >
              +
            </Typography>
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 40%, rgba(15, 5, 14, 0.88) 100%)",
            pointerEvents: "none",
          }}
        />
      )}
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
            fontFamily: create
              ? '"Alice", "Georgia", "Times New Roman", serif'
              : "inherit",
            fontWeight: create ? 400 : 700,
            letterSpacing: create ? "0.02em" : undefined,
            color: accent || create ? "primary.light" : "#F5F5F5",
            lineHeight: 1.2,
            textShadow: create ? "none" : "0 1px 8px rgba(0,0,0,0.55)",
          }}
        >
          {title}
        </Typography>
        {meta ? (
          <Typography
            variant="caption"
            sx={{
              color: create
                ? "rgba(245,245,245,0.62)"
                : "rgba(245,245,245,0.72)",
              display: "block",
              mt: 0.25,
              lineHeight: 1.35,
            }}
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
    borderColor: create
      ? "rgba(91, 44, 111, 0.55)"
      : accent
        ? "primary.main"
        : "rgba(232, 216, 199, 0.16)",
    borderStyle: create ? "dashed" : "solid",
    boxShadow: create ? "0 10px 28px rgba(0,0,0,0.28)" : undefined,
    transition: reduced
      ? undefined
      : "transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease, border-color 180ms ease",
    animation: reduced ? undefined : `boardPosterIn 420ms ease both`,
    animationDelay: reduced ? undefined : `${Math.min(index, 12) * 40}ms`,
    "@keyframes boardPosterIn": {
      from: { opacity: 0, transform: "translateY(10px)" },
      to: { opacity: muted ? 0.55 : 1, transform: "translateY(0)" },
    },
    ".board-grid:hover &": reduced
      ? undefined
      : { opacity: muted ? 0.4 : create ? 0.72 : 0.55 },
    ".board-grid:hover &:hover, .board-grid:hover &:focus-within": reduced
      ? undefined
      : {
          opacity: 1,
          transform: "scale(1.03)",
          zIndex: 2,
          boxShadow: create
            ? "0 16px 40px rgba(91, 44, 111, 0.35)"
            : "0 12px 40px rgba(0,0,0,0.45)",
          borderColor: create ? "primary.main" : undefined,
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
      {notice && !select ? (
        <Chip
          size="small"
          color="primary"
          label={notice}
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 3,
            height: 24,
            fontWeight: 600,
            pointerEvents: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
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
