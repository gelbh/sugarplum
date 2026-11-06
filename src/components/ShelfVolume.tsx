import type { MouseEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import MoreVertIcon from "@mui/icons-material/MoreVert";

export type ShelfSelect = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  inputLabel: string;
};

type Props = {
  title: string;
  href: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  openLabel?: string;
  meta?: string;
  studyLabel: string;
  onStudy: () => void;
  moreLabel: string;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
  select?: ShelfSelect;
  children?: ReactNode;
};

export default function ShelfVolume({
  title,
  href,
  onNavigate,
  openLabel,
  meta,
  studyLabel,
  onStudy,
  moreLabel,
  onMore,
  select,
  children,
}: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, bgcolor: "background.paper", borderColor: "divider", height: "100%", "&:hover": { bgcolor: "action.hover" } }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        {select ? (
          <Checkbox
            checked={select.checked}
            indeterminate={select.indeterminate}
            disabled={select.disabled}
            onChange={select.onChange}
            inputProps={{ "aria-label": select.inputLabel }}
            sx={{ p: 1.5 }}
          />
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {select ? (
            <Button variant="text" onClick={select.onChange} disabled={select.disabled} sx={{ p: 0, textAlign: "left", textTransform: "none", color: "text.primary" }}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>{title}</Typography>
            </Button>
          ) : (
            <Link href={href} aria-label={openLabel ?? `Open ${title}`} underline="hover" color="inherit" onClick={onNavigate} sx={{ display: "block", borderRadius: 1, outlineOffset: 2 }}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>{title}</Typography>
            </Link>
          )}
          {meta ? (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>{meta}</Typography>
          ) : null}
        </Box>
      </Box>
      {select ? null : (
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <Button variant="outlined" onClick={onStudy} aria-label={studyLabel} sx={{ minHeight: 48 }}>{studyLabel}</Button>
          <IconButton aria-label={moreLabel} onClick={onMore} sx={{ width: 48, height: 48 }}>
            <MoreVertIcon />
          </IconButton>
        </Box>
      )}
      {children}
    </Paper>
  );
}
