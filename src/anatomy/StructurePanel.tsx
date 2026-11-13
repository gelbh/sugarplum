import { useMemo, useState, type ReactNode } from "react";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import FaceOutlinedIcon from "@mui/icons-material/FaceOutlined";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import FilterCenterFocusIcon from "@mui/icons-material/FilterCenterFocus";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { AnatomyRegion, AnatomyStructure } from "./types";
import type { StructureUiAction, StructureUiState } from "./structureState";

type Props = {
  structures: AnatomyStructure[];
  regions?: AnatomyRegion[];
  activeRegions: Set<string>;
  onToggleRegion: (regionId: string) => void;
  onSelectAllRegions: () => void;
  onClearRegions: () => void;
  onSetRegions: (regionIds: string[]) => void;
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
};

type RegionDisplay = {
  region: AnatomyRegion;
  family: string;
  short: string;
};

const FAMILY_ORDER = ["Legs", "Head", "Trunk", "Other"] as const;

function regionFamilyKey(id: string): string {
  if (id.startsWith("legs-")) return "Legs";
  if (id === "skull" || id === "neck") return "Head";
  if (
    id === "spine" ||
    id === "ribs" ||
    id === "organs" ||
    id === "pelvis-tail"
  ) {
    return "Trunk";
  }
  return "Other";
}

function parseRegionDisplay(region: AnatomyRegion): RegionDisplay {
  const sep = " · ";
  const i = region.label.indexOf(sep);
  if (i !== -1) {
    return {
      region,
      family: region.label.slice(0, i),
      short: region.label.slice(i + sep.length),
    };
  }
  return {
    region,
    family: regionFamilyKey(region.id),
    short: region.label,
  };
}

function regionIcon(id: string): ReactNode {
  if (id.startsWith("legs-")) {
    return <DirectionsWalkOutlinedIcon aria-hidden />;
  }
  if (id === "skull") {
    return <FaceOutlinedIcon aria-hidden />;
  }
  if (id === "organs") {
    return <FavoriteBorderOutlinedIcon aria-hidden />;
  }
  if (id === "spine") {
    return <StraightenOutlinedIcon aria-hidden />;
  }
  return <ViewInArOutlinedIcon aria-hidden />;
}

function RegionToggle({
  display,
  active,
  onToggle,
}: {
  display: RegionDisplay;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <ButtonBase
      focusRipple
      onClick={onToggle}
      aria-pressed={active}
      aria-label={display.region.label}
      sx={{
        display: "inline-flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 0.5,
        width: "100%",
        minHeight: 30,
        px: 0.75,
        py: 0,
        borderRadius: 1,
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? "primary.main" : "transparent",
        color: active ? "primary.contrastText" : "text.primary",
        textAlign: "left",
        transition:
          "background-color 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out",
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: active ? "primary.dark" : "action.hover",
        },
        "&.Mui-focusVisible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 1,
        },
        "& .MuiSvgIcon-root": {
          display: "block",
          fontSize: 15,
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          flexShrink: 0,
          opacity: active ? 1 : 0.85,
        }}
      >
        {regionIcon(display.region.id)}
      </Box>
      <Typography
        variant="body2"
        component="span"
        sx={{
          fontWeight: active ? 600 : 500,
          lineHeight: 1,
          fontSize: "0.75rem",
        }}
      >
        {display.short}
      </Typography>
    </ButtonBase>
  );
}

function StructureRow({
  structure: s,
  ui,
  dispatch,
}: {
  structure: AnatomyStructure;
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
}) {
  const hidden = ui.hidden.has(s.id);
  const isolated = ui.isolatedId === s.id;
  const selected = ui.selectedId === s.id;
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => dispatch({ type: "select", id: s.id })}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          dispatch({ type: "select", id: s.id });
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        minHeight: 30,
        px: 0.75,
        py: 0.2,
        borderRadius: 1,
        cursor: "pointer",
        bgcolor: selected ? "action.selected" : "transparent",
        borderLeft: 2,
        borderColor: selected ? "primary.main" : "transparent",
        opacity: hidden ? 0.4 : 1,
        transition:
          "background-color 140ms ease-out, border-color 140ms ease-out, opacity 140ms ease-out",
        "&:hover": {
          bgcolor: selected ? "action.selected" : "action.hover",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 1,
        },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: "0.8125rem",
          fontWeight: selected ? 600 : 400,
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </Typography>
      {isolated ? (
        <Typography
          variant="caption"
          color="primary"
          sx={{ flexShrink: 0, fontSize: "0.65rem" }}
        >
          solo
        </Typography>
      ) : null}
      <IconButton
        size="small"
        aria-label={hidden ? `Show ${s.label}` : `Hide ${s.label}`}
        onClick={(ev) => {
          ev.stopPropagation();
          dispatch({ type: "toggleHidden", id: s.id });
        }}
        sx={{ p: 0.35 }}
      >
        {hidden ? (
          <VisibilityOffIcon sx={{ fontSize: 16 }} />
        ) : (
          <VisibilityIcon sx={{ fontSize: 16 }} />
        )}
      </IconButton>
      <IconButton
        size="small"
        aria-label={`Isolate ${s.label}`}
        color={isolated ? "primary" : "default"}
        onClick={(ev) => {
          ev.stopPropagation();
          dispatch(
            isolated ? { type: "clearIsolate" } : { type: "isolate", id: s.id },
          );
        }}
        sx={{ p: 0.35 }}
      >
        <FilterCenterFocusIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}

export default function StructurePanel({
  structures,
  regions,
  activeRegions,
  onToggleRegion,
  onSelectAllRegions,
  onClearRegions,
  onSetRegions,
  ui,
  dispatch,
}: Props) {
  const [q, setQ] = useState("");
  const visibleStructures = useMemo(() => {
    if (!regions?.length) return structures;
    return structures.filter(
      (s) => s.region != null && activeRegions.has(s.region),
    );
  }, [structures, regions, activeRegions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return visibleStructures;
    return visibleStructures.filter((s) =>
      s.label.toLowerCase().includes(needle),
    );
  }, [visibleStructures, q]);

  const regionGroups = useMemo(() => {
    if (!regions?.length) return [];
    const displays = regions.map(parseRegionDisplay);
    const byFamily = new Map<string, RegionDisplay[]>();
    for (const d of displays) {
      const list = byFamily.get(d.family) ?? [];
      list.push(d);
      byFamily.set(d.family, list);
    }
    const ordered: string[] = FAMILY_ORDER.filter((f) => byFamily.has(f));
    for (const key of byFamily.keys()) {
      if (!ordered.includes(key)) {
        ordered.push(key);
      }
    }
    return ordered.map((family) => ({
      family,
      items: byFamily.get(family)!,
    }));
  }, [regions]);

  const structureGroups = useMemo(() => {
    if (!regions?.length) {
      return filtered.length
        ? [
            {
              regionId: null as string | null,
              label: null as string | null,
              items: filtered,
            },
          ]
        : [];
    }
    const byRegion = new Map<string, AnatomyStructure[]>();
    for (const s of filtered) {
      const key = s.region ?? "__none";
      const list = byRegion.get(key) ?? [];
      list.push(s);
      byRegion.set(key, list);
    }
    const groups: {
      regionId: string | null;
      label: string | null;
      items: AnatomyStructure[];
    }[] = [];
    for (const r of regions) {
      const items = byRegion.get(r.id);
      if (!items?.length) continue;
      groups.push({ regionId: r.id, label: r.label, items });
    }
    const orphan = byRegion.get("__none");
    if (orphan?.length) {
      groups.push({ regionId: null, label: "Other", items: orphan });
    }
    return groups;
  }, [filtered, regions]);

  const allRegionsOn =
    !!regions?.length && regions.every((r) => activeRegions.has(r.id));
  const noRegionsOn = activeRegions.size === 0;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        width: { xs: "100%", md: 280 },
        flex: { xs: "0 1 auto", md: "0 0 auto" },
        flexShrink: { xs: 1, md: 0 },
        minHeight: 0,
        height: { xs: "auto", md: "100%" },
        maxHeight: { xs: "42%", md: "none" },
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 1.25,
        overflow: "hidden",
      }}
    >
      {regionGroups.length > 0 ? (
        <Box sx={{ flexShrink: 0 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.75 }}
          >
            <Typography
              variant="subtitle2"
              component="h2"
              sx={{ fontWeight: 600 }}
            >
              Regions
            </Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                disabled={allRegionsOn}
                onClick={onSelectAllRegions}
                sx={{ minWidth: 0, px: 0.75, fontSize: "0.7rem" }}
              >
                All
              </Button>
              <Button
                size="small"
                disabled={noRegionsOn}
                onClick={onClearRegions}
                sx={{ minWidth: 0, px: 0.75, fontSize: "0.7rem" }}
              >
                None
              </Button>
            </Stack>
          </Stack>
          <Stack spacing={0.75}>
            {regionGroups.map(({ family, items }) => {
              const ids = items.map((d) => d.region.id);
              const familyAllOn = ids.every((id) => activeRegions.has(id));
              return (
                <Box
                  key={family}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 0.75,
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 0.5 }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        fontSize: "0.65rem",
                      }}
                    >
                      {family}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => {
                        if (familyAllOn) {
                          const next = [...activeRegions].filter(
                            (id) => !ids.includes(id),
                          );
                          onSetRegions(next);
                        } else {
                          onSetRegions([
                            ...new Set([...activeRegions, ...ids]),
                          ]);
                        }
                      }}
                      sx={{ minWidth: 0, px: 0.5, fontSize: "0.65rem", py: 0 }}
                    >
                      {familyAllOn ? "Clear" : "All"}
                    </Button>
                  </Stack>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 0.5,
                    }}
                  >
                    {items.map((d) => (
                      <RegionToggle
                        key={d.region.id}
                        display={d}
                        active={activeRegions.has(d.region.id)}
                        onToggle={() => onToggleRegion(d.region.id)}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ) : null}

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={0.75}>
          <Typography
            variant="subtitle2"
            component="h2"
            sx={{ fontWeight: 600 }}
          >
            Structures
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {filtered.length}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            onClick={() => dispatch({ type: "showAll" })}
            sx={{ minWidth: 0, px: 0.75, fontSize: "0.7rem" }}
          >
            Show
          </Button>
          <Button
            size="small"
            onClick={() =>
              dispatch({
                type: "hideAll",
                ids: visibleStructures.map((s) => s.id),
              })
            }
            disabled={visibleStructures.length === 0}
            sx={{ minWidth: 0, px: 0.75, fontSize: "0.7rem" }}
          >
            Hide
          </Button>
        </Stack>
      </Stack>

      <TextField
        size="small"
        placeholder="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{
          flexShrink: 0,
          "& .MuiInputBase-root": { fontSize: "0.8125rem" },
        }}
      />

      {regions && regions.length > 0 && visibleStructures.length === 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ flexShrink: 0 }}
        >
          Enable a region to load structures.
        </Typography>
      ) : null}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          mx: -0.5,
          px: 0.5,
        }}
      >
        <Stack spacing={1}>
          {structureGroups.map((group) => (
            <Box key={group.regionId ?? "__flat"}>
              {group.label ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    px: 0.75,
                    mb: 0.35,
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    fontSize: "0.65rem",
                  }}
                >
                  {group.label}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.disabled"
                    sx={{ ml: 0.75, fontWeight: 500, letterSpacing: 0 }}
                  >
                    {group.items.length}
                  </Typography>
                </Typography>
              ) : null}
              <Stack spacing={0.2}>
                {group.items.map((s) => (
                  <StructureRow
                    key={s.id}
                    structure={s}
                    ui={ui}
                    dispatch={dispatch}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
