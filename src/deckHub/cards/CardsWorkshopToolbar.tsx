import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import WorkshopSearchField from "../workshop/WorkshopSearchField";
import {
  PILL_BTN,
  type WorkshopViewMode,
} from "../workshop/workshopChrome";

export default function CardsWorkshopToolbar({
  cardCountLabel,
  cardsLength,
  query,
  onQueryChange,
  view,
  onViewChange,
  showArchived,
  onShowArchivedChange,
  busy,
  onCreateCard,
}: {
  cardCountLabel: string;
  cardsLength: number;
  query: string;
  onQueryChange: (next: string) => void;
  view: WorkshopViewMode;
  onViewChange: (_: unknown, next: WorkshopViewMode | null) => void;
  showArchived: boolean;
  onShowArchivedChange: (checked: boolean) => void;
  busy: boolean;
  onCreateCard: () => void;
}) {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1.25,
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        useFlexGap
        sx={{
          alignItems: "center",
        }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
          onClick={onCreateCard}
          sx={{
            ...PILL_BTN,
            px: 1.75,
            py: 0.85,
            fontSize: "0.8125rem",
          }}
        >
          Create card
        </Button>
        <Typography
          variant="caption"
          sx={{
            color: "rgba(232, 216, 199, 0.55)",
            letterSpacing: "0.04em",
          }}
        >
          {cardCountLabel}
        </Typography>
        {cardsLength > 0 ? (
          <WorkshopSearchField
            value={query}
            onChange={onQueryChange}
            placeholder="Search cards…"
            ariaLabel="Search cards"
            ariaControls="cards-workshop-results"
          />
        ) : null}
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          alignItems: "center",
        }}
      >
        {cardsLength > 0 ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            aria-label="Card layout"
            onChange={onViewChange}
            sx={{
              bgcolor: "rgba(18, 7, 15, 0.35)",
              "& .MuiToggleButton-root": {
                borderColor: "rgba(232, 216, 199, 0.16)",
                color: "rgba(232, 216, 199, 0.55)",
                px: 1,
                "&.Mui-selected": {
                  color: "primary.light",
                  bgcolor: "rgba(91, 44, 111, 0.35)",
                },
              },
            }}
          >
            <ToggleButton value="icons" aria-label="Icons" title="Icons">
              <GridViewOutlinedIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton
              value="details"
              aria-label="Details"
              title="Details"
            >
              <ViewListOutlinedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        ) : null}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showArchived}
              onChange={(_ev, checked) => {
                onShowArchivedChange(checked);
              }}
              disabled={busy}
            />
          }
          label="Show archived"
          sx={{
            mr: 0,
            ml: 0,
            gap: 0.75,
            "& .MuiFormControlLabel-label": {
              typography: "caption",
              letterSpacing: "0.04em",
              color: "rgba(232, 216, 199, 0.62)",
            },
          }}
        />
      </Stack>
    </Stack>
  );
}
