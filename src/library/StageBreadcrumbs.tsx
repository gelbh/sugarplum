import type { MouseEvent } from "react";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { isPlainClick, navigate } from "../nav/navigate";

export type StageCrumb = {
  label: string;
  href: string;
};

type Props = {
  crumbs: StageCrumb[];
  sx?: object;
};

function onCrumbClick(href: string, ev: MouseEvent<HTMLAnchorElement>) {
  if (ev.defaultPrevented || !isPlainClick(ev)) return;
  ev.preventDefault();
  navigate(href);
}

/** Shared uppercase stage crumb trail (Library › Subject › …). No hover chip fill. */
export default function StageBreadcrumbs({ crumbs, sx }: Props) {
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumbs
      aria-label="Breadcrumb"
      separator={
        <ChevronRightIcon
          sx={{
            fontSize: 14,
            color: "rgba(232, 216, 199, 0.35)",
          }}
        />
      }
      sx={{
        "& .MuiBreadcrumbs-ol": {
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 0.5,
        },
        "& .MuiBreadcrumbs-li": {
          display: "inline-flex",
          alignItems: "center",
        },
        ...sx,
      }}
    >
      {crumbs.map((crumb) => (
        <Link
          key={crumb.href}
          href={crumb.href}
          underline="none"
          onClick={(ev) => onCrumbClick(crumb.href, ev)}
          sx={{
            typography: "caption",
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(245, 245, 245, 0.48)",
            transition: "color 140ms ease",
            "&:hover, &:focus-visible": {
              color: "primary.light",
            },
          }}
        >
          {crumb.label}
        </Link>
      ))}
    </Breadcrumbs>
  );
}
