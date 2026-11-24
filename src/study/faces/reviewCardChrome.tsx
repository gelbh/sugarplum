import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { type ReactNode } from "react";
import type { CardDraftView, CardType, StudyRating } from "../../api/client";
import {
  draftForType,
  TYPE_LABELS,
  typeSelectModel,
  type DraftEditorChange,
} from "../../draftReview/kernel";
import { CARD_TYPE_ICONS } from "../../shared/ui/cardTypeIcons";
import { SelectEnumItem, renderSelectEnumValue } from "../../shared/ui/SelectEnumItem";
import { gradeColorVars } from "../grading/gradeColors";

const STAGE_SELECT_SX = {
  minWidth: 168,
  color: "var(--sp-ivory)",
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in srgb, var(--sp-ivory) 35%, transparent)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in srgb, var(--sp-ivory) 60%, transparent)",
  },
  "& .MuiSelect-icon": { color: "inherit" },
  "&&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--sp-ivory)",
  },
  "&&.Mui-disabled": {
    color: "color-mix(in srgb, var(--sp-ivory) 55%, transparent)",
  },
  "&&.Mui-disabled .MuiSelect-select": {
    WebkitTextFillColor: "color-mix(in srgb, var(--sp-ivory) 55%, transparent)",
  },
  "&&.Mui-disabled .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in srgb, var(--sp-ivory) 20%, transparent)",
  },
} as const;

export function StageTypeSelect({
  card,
  disabled,
  onChange,
}: {
  card: CardDraftView;
  disabled: boolean;
  onChange: (next: DraftEditorChange) => void;
}) {
  const model = typeSelectModel(card.type as CardType);
  return (
    <Select
      size="small"
      value={model.value}
      disabled={disabled || model.locked}
      onChange={(e) => onChange(draftForType(card, e.target.value as CardType))}
      SelectDisplayProps={{ "aria-label": "Card type" }}
      sx={STAGE_SELECT_SX}
      renderValue={(value) =>
        renderSelectEnumValue({
          icon: CARD_TYPE_ICONS[value as CardType],
          label: TYPE_LABELS[value as CardType],
        })
      }
      MenuProps={{
        slotProps: {
          paper: {
            sx: {
              bgcolor: "var(--sp-stage-deep, #180816)",
              color: "var(--sp-ivory)",
              borderColor:
                "color-mix(in srgb, var(--sp-ivory) 24%, transparent)",
              "& .MuiMenuItem-root.Mui-selected": {
                bgcolor: "rgba(206, 147, 216, 0.16)",
              },
              "& .MuiMenuItem-root.Mui-selected:hover": {
                bgcolor: "rgba(206, 147, 216, 0.24)",
              },
            },
          },
        },
      }}
    >
      {model.options.map((t) => (
        <MenuItem key={t} value={t}>
          <SelectEnumItem icon={CARD_TYPE_ICONS[t]} label={TYPE_LABELS[t]} />
        </MenuItem>
      ))}
    </Select>
  );
}

export function RoundAction({
  label,
  rating,
  size,
  disabled,
  onClick,
  children,
}: {
  label: string;
  rating: StudyRating;
  size: number;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const c = gradeColorVars(rating);
  return (
    <IconButton
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        width: size,
        height: size,
        color: c.fg,
        bgcolor: c.wash,
        border: "1px solid",
        borderColor: c.border,
        "&:hover": { bgcolor: c.wash, filter: "brightness(1.12)" },
        "&:active": { transform: "scale(0.95)" },
        "&.Mui-disabled": { opacity: 0.35, color: c.fg, borderColor: c.border },
      }}
    >
      {children}
    </IconButton>
  );
}
