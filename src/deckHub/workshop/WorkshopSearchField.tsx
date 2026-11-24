import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { ROW_ACTION } from "./workshopChrome";
import { normalizeWorkshopQuery } from "./workshopSearch";

const SEARCH_FIELD_SX = {
  minWidth: 160,
  maxWidth: 260,
  flex: "1 1 160px",
  "& .MuiOutlinedInput-root": {
    color: "rgba(232, 216, 199, 0.88)",
    bgcolor: "rgba(18, 7, 15, 0.35)",
    borderRadius: 2,
    "& fieldset": { borderColor: "rgba(232, 216, 199, 0.16)" },
    "&:hover fieldset": { borderColor: "rgba(232, 216, 199, 0.28)" },
    "&.Mui-focused fieldset": { borderColor: "rgba(209, 163, 226, 0.55)" },
  },
  "& .MuiInputBase-input::placeholder": {
    color: "rgba(232, 216, 199, 0.42)",
    opacity: 1,
  },
  // Hide native WebKit clear so the custom clear control is the only one.
  '& input[type="search"]::-webkit-search-cancel-button': {
    WebkitAppearance: "none",
    appearance: "none",
  },
} as const;

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  ariaControls: string;
};

export default function WorkshopSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  ariaControls,
}: Props) {
  const searching = normalizeWorkshopQuery(value) !== "";

  return (
    <TextField
      type="search"
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(ev) => onChange(ev.target.value)}
      sx={SEARCH_FIELD_SX}
      slotProps={{
        htmlInput: {
          "aria-label": ariaLabel,
          "aria-controls": ariaControls,
        },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon
                fontSize="small"
                sx={{ color: "rgba(232, 216, 199, 0.42)" }}
              />
            </InputAdornment>
          ),
          endAdornment: searching ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="Clear search"
                onClick={() => onChange("")}
                edge="end"
                sx={ROW_ACTION}
              >
                <ClearRoundedIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}
