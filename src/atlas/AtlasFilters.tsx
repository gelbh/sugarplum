import { useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  GROUP_LABELS,
  TIER_ORDER,
  isTaxonTerm,
  termLabel,
  type AtlasFilters as Filters,
  type TermOption,
} from "./filter";
import type { AtlasTier, ParasiteGroup } from "./types";

type Props = {
  filters: Filters;
  groups: ParasiteGroup[];
  hostOptions: TermOption[];
  organOptions: TermOption[];
  focusActive: boolean;
  onChange: (next: Filters) => void;
};

const Separator = () => (
  <Box
    aria-hidden
    sx={{ width: "1px", height: 22, bgcolor: "divider", flex: "none", mx: 0.5 }}
  />
);

function ToggleChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Chip
      label={label}
      clickable
      aria-pressed={selected}
      color={selected ? "primary" : "default"}
      variant={selected ? "filled" : "outlined"}
      onClick={onClick}
      sx={{
        flex: "none",
        fontWeight: 600,
        bgcolor: selected ? undefined : "background.paper",
      }}
    />
  );
}

function TermMenuChip({
  name,
  anyLabel,
  value,
  options,
  onSelect,
}: {
  name: string;
  anyLabel: string;
  value: string | null;
  options: TermOption[];
  onSelect: (term: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (term: string | null) => {
    setAnchor(null);
    onSelect(term);
  };
  return (
    <>
      <Chip
        label={
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            {name}: {value === null ? "any" : termLabel(value)}
            <ExpandMoreIcon sx={{ fontSize: 16, mr: -0.5 }} />
          </Box>
        }
        clickable
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        color={value === null ? "default" : "primary"}
        variant={value === null ? "outlined" : "filled"}
        onClick={(ev) => setAnchor(ev.currentTarget)}
        sx={{
          flex: "none",
          fontWeight: 600,
          bgcolor: value === null ? "background.paper" : undefined,
        }}
      />
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        <MenuItem selected={value === null} onClick={() => pick(null)}>
          {anyLabel}
        </MenuItem>
        {options.map((o) => (
          <MenuItem
            key={o.term}
            selected={value === o.term}
            onClick={() => pick(o.term)}
            sx={{
              pl: 2 + o.depth * 1.5,
              fontStyle: isTaxonTerm(o.term) ? "italic" : undefined,
            }}
          >
            {termLabel(o.term)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export default function AtlasFilters({
  filters,
  groups,
  hostOptions,
  organOptions,
  focusActive,
  onChange,
}: Props) {
  const toggleGroup = (g: ParasiteGroup) =>
    onChange({
      ...filters,
      groups: filters.groups.includes(g)
        ? filters.groups.filter((x) => x !== g)
        : [...filters.groups, g],
    });

  return (
    <Box
      role="toolbar"
      aria-label="Filter parasites"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        overflowX: "auto",
        // Room for focus rings inside the scroller; bleed to the gutter on phones.
        py: 0.5,
        mx: { xs: -2, sm: 0 },
        px: { xs: 2, sm: 0 },
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      <ToggleChip
        label="All groups"
        selected={filters.groups.length === 0}
        onClick={() => onChange({ ...filters, groups: [] })}
      />
      {groups.map((g) => (
        <ToggleChip
          key={g}
          label={GROUP_LABELS[g].plural}
          selected={filters.groups.includes(g)}
          onClick={() => toggleGroup(g)}
        />
      ))}
      <Separator />
      <TermMenuChip
        name="Host"
        anyLabel="Any host"
        value={filters.host}
        options={hostOptions}
        onSelect={(host) => onChange({ ...filters, host })}
      />
      <TermMenuChip
        name="Organ"
        anyLabel="Any organ"
        value={filters.organ}
        options={organOptions}
        onSelect={(organ) => onChange({ ...filters, organ })}
      />
      {focusActive ? (
        <>
          <Separator />
          <TermMenuChip
            name="Focus"
            anyLabel="Any focus"
            value={filters.tier}
            options={TIER_ORDER.map((tier) => ({ term: tier, depth: 0 }))}
            onSelect={(tier) =>
              onChange({
                ...filters,
                tier: (tier as AtlasTier | null) ?? null,
              })
            }
          />
        </>
      ) : null}
      <Separator />
      <ToggleChip
        label="Zoonotic only"
        selected={filters.zoonoticOnly}
        onClick={() =>
          onChange({ ...filters, zoonoticOnly: !filters.zoonoticOnly })
        }
      />
    </Box>
  );
}
