import type { MouseEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { alpha } from "@mui/material/styles";
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
  imageAlt?: string;
  href?: string;
  openLabel?: string;
  primaryLabel?: string | null;
  onPrimary?: () => void;
  badge?: string | null;
  muted?: boolean;
  accent?: boolean;
  create?: boolean;
  onCreate?: () => void;
  moreLabel?: string;
  onMore?: (event: MouseEvent<HTMLButtonElement>) => void;
  select?: BoardTileSelect;
  credit?: BoardTileCredit | null;
  footer?: ReactNode;
};

export default function BoardTile({
  title,
  meta,
  imageSrc = "",
  imageAlt = "",
  href,
  openLabel,
  primaryLabel,
  onPrimary,
  badge,
  muted,
  accent,
  create,
  onCreate,
  moreLabel,
  onMore,
  select,
  credit,
  footer,
}: Props) {
  const svg = imageSrc.endsWith(".svg");
  const body = (
    <>
      <Box
        aria-hidden={imageAlt === ""}
        sx={(theme) => ({
          width: { xs: 56, sm: 72 },
          height: { xs: 56, sm: 72 },
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.12),
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          flexShrink: 0,
          border: create ? "1px dashed" : "none",
          borderColor: "primary.main",
        })}
      >
        {create ? (
          <Typography variant="h4" color="primary" sx={{ fontWeight: 600, lineHeight: 1 }}>
            +
          </Typography>
        ) : (
          <Box
            component="img"
            src={imageSrc}
            alt={imageAlt}
            sx={{
              width: svg ? "62%" : "100%",
              height: svg ? "62%" : "100%",
              objectFit: svg ? "contain" : "cover",
            }}
          />
        )}
      </Box>
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{
          fontWeight: 600,
          color: accent ? "primary.main" : "text.primary",
          textAlign: "center",
          px: 0.5,
          lineHeight: 1.25,
        }}
      >
        {title}
      </Typography>
      {meta ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          {meta}
        </Typography>
      ) : null}
      {credit ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center", px: 0.5, lineHeight: 1.3 }}
          onClick={(ev) => ev.stopPropagation()}
        >
          Photo by{" "}
          <Link
            href={withReferral(credit.photographerUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
          >
            {credit.photographerName}
          </Link>
          {" on "}
          <Link
            href={withReferral(credit.photoHtmlUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
          >
            Unsplash
          </Link>
        </Typography>
      ) : null}
      {badge ? <Chip size="small" color="primary" label={badge} /> : null}
    </>
  );

  return (
    <Box
      sx={{
        position: "relative",
        height: "100%",
        minHeight: { xs: 148, sm: 168 },
        opacity: muted ? 0.55 : 1,
        border: 1,
        borderColor: accent ? "primary.main" : "divider",
        borderStyle: create ? "dashed" : "solid",
        borderRadius: 2,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        p: 1.5,
        transition: "border-color 160ms ease",
        "&:hover": muted
          ? undefined
          : { borderColor: "primary.main", bgcolor: "action.hover" },
      }}
    >
      {select ? (
        <Checkbox
          checked={select.checked}
          indeterminate={select.indeterminate}
          disabled={select.disabled}
          onChange={select.onChange}
          inputProps={{ "aria-label": select.inputLabel }}
          sx={{ position: "absolute", top: 4, left: 4, zIndex: 2 }}
        />
      ) : null}
      {onMore && moreLabel ? (
        <IconButton
          aria-label={moreLabel}
          onClick={onMore}
          size="small"
          sx={{ position: "absolute", top: 4, right: 4, zIndex: 2, width: 44, height: 44 }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ) : null}

      {create && onCreate ? (
        <ButtonBase
          onClick={onCreate}
          focusRipple
          aria-label={openLabel ?? title}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            width: "100%",
            flex: 1,
            borderRadius: 1,
          }}
        >
          {body}
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
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            width: "100%",
            flex: 1,
            borderRadius: 1,
            outlineOffset: 2,
          }}
        >
          {body}
        </Link>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            width: "100%",
            flex: 1,
          }}
        >
          {body}
        </Box>
      )}

      {primaryLabel && onPrimary && !select ? (
        <Button
          size="small"
          variant="contained"
          onClick={onPrimary}
          disabled={muted}
          sx={{ minHeight: 40, mt: 0.5, zIndex: 1 }}
        >
          {primaryLabel}
        </Button>
      ) : null}
      {footer}
    </Box>
  );
}
