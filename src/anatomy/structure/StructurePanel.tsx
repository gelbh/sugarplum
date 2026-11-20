import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { AnatomyRegion, AnatomyStructure } from "../types";
import type { StructureUiAction, StructureUiState } from "./structureState";
import { StructureRegionToggle } from "./StructureRegionToggle";
import { StructureRow } from "./StructureRow";
import {
  addRegionIds,
  removeRegionIds,
  toggleRegionId,
} from "./structurePanelRegions";
import { useStructurePanelFilter } from "./useStructurePanelFilter";

type Props = {
  structures: AnatomyStructure[];
  regions?: AnatomyRegion[];
  activeRegions: Set<string>;
  onChangeRegions: (regionIds: string[]) => void;
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
  maskNames?: boolean;
  revealedIds?: ReadonlySet<string>;
};

export default function StructurePanel({
  structures,
  regions,
  activeRegions,
  onChangeRegions,
  ui,
  dispatch,
  maskNames = false,
  revealedIds,
}: Props) {
  const {
    q,
    setQ,
    visibleStructures,
    filtered,
    regionGroups,
    structureGroups,
  } = useStructurePanelFilter({
    structures,
    regions,
    activeRegions,
    maskNames,
  });

  const allRegionsOn =
    !!regions?.length && regions.every((r) => activeRegions.has(r.id));
  const noRegionsOn = activeRegions.size === 0;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        width: "100%",
        flex: 1,
        flexShrink: 1,
        minHeight: 0,
        height: "100%",
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 1.25,
        overflow: "hidden",
      }}
    >
      {regionGroups.length > 0 ? (
        <Box
          sx={{
            // Regions used to be flexShrink:0 with no overflow, so family
            // chips clipped below the panel edge with no way to reach them.
            flex: "0 1 auto",
            flexShrink: 1,
            minHeight: { xs: "9.5rem", md: 0 },
            maxHeight: { xs: "65%", md: "48%" },
            overflowY: "auto",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              mb: 0.75,
              position: "sticky",
              top: 0,
              zIndex: 1,
              bgcolor: "background.paper",
              pt: 0.25
            }}>
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
                onClick={() => onChangeRegions(regions?.map((r) => r.id) ?? [])}
                sx={{ minWidth: 0, px: 0.75, fontSize: "0.7rem" }}
              >
                All
              </Button>
              <Button
                size="small"
                disabled={noRegionsOn}
                onClick={() => onChangeRegions([])}
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
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 0.5
                    }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        fontSize: "0.65rem"
                      }}>
                      {family}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() =>
                        onChangeRegions(
                          familyAllOn
                            ? removeRegionIds(activeRegions, ids)
                            : addRegionIds(activeRegions, ids),
                        )
                      }
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
                      <StructureRegionToggle
                        key={d.region.id}
                        display={d}
                        active={activeRegions.has(d.region.id)}
                        onToggle={() =>
                          onChangeRegions(
                            toggleRegionId(activeRegions, d.region.id),
                          )
                        }
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
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0
        }}>
        <Stack direction="row" spacing={0.75} sx={{
          alignItems: "baseline"
        }}>
          <Typography
            variant="subtitle2"
            component="h2"
            sx={{ fontWeight: 600 }}
          >
            Structures
          </Typography>
          <Typography variant="caption" sx={{
            color: "text.secondary"
          }}>
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
        placeholder={maskNames ? "Search disabled in test mode" : "Search"}
        value={maskNames ? "" : q}
        disabled={maskNames}
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
          sx={{
            color: "text.secondary",
            flexShrink: 0
          }}>
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
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    px: 0.75,
                    mb: 0.35,
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    fontSize: "0.65rem"
                  }}>
                  {group.label}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{
                      color: "text.disabled",
                      ml: 0.75,
                      fontWeight: 500,
                      letterSpacing: 0
                    }}>
                    {group.items.length}
                  </Typography>
                </Typography>
              ) : null}
              <Stack spacing={0.2}>
                {group.items.map((s) => {
                  const labelMasked =
                    maskNames && !(revealedIds?.has(s.id) ?? false);
                  return (
                    <StructureRow
                      key={s.id}
                      structure={s}
                      ui={ui}
                      dispatch={dispatch}
                      displayLabel={labelMasked ? "Hidden" : s.label}
                      labelMasked={labelMasked}
                    />
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
