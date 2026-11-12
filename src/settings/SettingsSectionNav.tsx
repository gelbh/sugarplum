import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

export type SettingsNavSection = {
  id: string;
  label: string;
  summary?: string;
};

type Props = {
  sections: SettingsNavSection[];
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SettingsSectionNav({ sections }: Props) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const [activeId, setActiveId] = useState(ids[0] ?? "");

  useEffect(() => {
    if (ids.length === 0) return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              (a.target as HTMLElement).offsetTop -
              (b.target as HTMLElement).offsetTop,
          );
        const top = visible[0]?.target as HTMLElement | undefined;
        if (top?.id) setActiveId(top.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  function onChipClick(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    setActiveId(id);
  }

  return (
    <Box
      sx={{
        position: "sticky",
        top: 8,
        zIndex: 2,
        py: 1,
        mb: 1,
        bgcolor: "background.default",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {sections.map((s) => {
          const selected = s.id === activeId;
          const label = s.summary ? `${s.label} · ${s.summary}` : s.label;
          return (
            <Chip
              key={s.id}
              label={label}
              clickable
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              onClick={() => onChipClick(s.id)}
              aria-current={selected ? "true" : undefined}
              sx={{ maxWidth: "100%" }}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
