import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import TransferWithinAStationOutlinedIcon from "@mui/icons-material/TransferWithinAStationOutlined";
import {
  STAGE_HOST_ROLES,
  lifecycleStageSchema,
  type ParasiteFields,
} from "../../worker/atlas/templates/parasite";
import { SelectEnumItem, renderSelectEnumValue } from "../components/SelectEnumItem";

/** Learner drafts use the loose template stage (free-text host). */
export type StageDraft = ParasiteFields["lifecycleStages"][number];

type HostRole = (typeof STAGE_HOST_ROLES)[number];

const HOST_ROLE_ICONS: Record<HostRole, SvgIconComponent> = {
  definitive: PetsOutlinedIcon,
  intermediate: SwapHorizOutlinedIcon,
  paratenic: TransferWithinAStationOutlinedIcon,
  environment: PublicOutlinedIcon,
};

type Props = {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
  disabled?: boolean;
};

const emptyStage = (): StageDraft =>
  lifecycleStageSchema.parse({ name: "new stage" });

function parseHostRole(raw: string): StageDraft["hostRole"] {
  if (!raw) return null;
  return (STAGE_HOST_ROLES as readonly string[]).includes(raw)
    ? (raw as (typeof STAGE_HOST_ROLES)[number])
    : null;
}

/** Parse duration text; incomplete ranges (`14-`, `to`) stay null until both sides exist. */
export function parseDays(raw: string): StageDraft["durationDays"] {
  const t = raw.trim();
  if (!t) return null;
  if (/[-–]|to/i.test(t)) {
    const parts = t.split(/\s*[-–to]+\s*/i).map((p) => p.trim());
    if (parts.length < 2 || parts.some((p) => p === "")) return null;
    const min = Number(parts[0]);
    const max = Number(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return { min: n, max: n };
}

function daysText(d: StageDraft["durationDays"]): string {
  if (!d) return "";
  return d.min === d.max ? String(d.min) : `${d.min}-${d.max}`;
}

export default function StageListEditor({
  stages,
  onChange,
  disabled,
}: Props) {
  const update = (i: number, patch: Partial<StageDraft>) => {
    onChange(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= stages.length) return;
    const next = stages.slice();
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    onChange(next);
  };

  return (
    <Stack spacing={1.5}>
      {stages.length === 0 ? (
        <Typography color="text.secondary" sx={{ fontSize: "0.9rem" }}>
          No stages yet. Add one to start the cycle.
        </Typography>
      ) : null}
      {stages.map((s, i) => (
        <Box
          key={i}
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            p: 1.25,
            display: "grid",
            gap: 1,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              sx={{
                fontWeight: 700,
                minWidth: 24,
                color: "primary.main",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {i + 1}
            </Typography>
            <Button
              size="small"
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
              sx={{ textTransform: "none" }}
            >
              Up
            </Button>
            <Button
              size="small"
              disabled={disabled || i === stages.length - 1}
              onClick={() => move(i, 1)}
              sx={{ textTransform: "none" }}
            >
              Down
            </Button>
            <Button
              size="small"
              color="error"
              disabled={disabled}
              onClick={() => onChange(stages.filter((_, j) => j !== i))}
              sx={{ textTransform: "none" }}
            >
              Remove
            </Button>
          </Stack>
          <TextField
            label="Name"
            size="small"
            value={s.name}
            disabled={disabled}
            onChange={(ev) => update(i, { name: ev.target.value })}
            fullWidth
            required
          />
          <TextField
            label="Location"
            size="small"
            value={s.location ?? ""}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { location: ev.target.value.trim() || null })
            }
            fullWidth
          />
          <TextField
            select
            label="Host role"
            size="small"
            value={s.hostRole ?? ""}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { hostRole: parseHostRole(ev.target.value) })
            }
            fullWidth
            slotProps={{
              select: {
                displayEmpty: true,
                renderValue: (value) => {
                  const raw = String(value);
                  if (!raw) return "None";
                  const role = raw as HostRole;
                  return renderSelectEnumValue({
                    icon: HOST_ROLE_ICONS[role],
                    label: role,
                  });
                },
              },
            }}
          >
            <MenuItem value="">None</MenuItem>
            {STAGE_HOST_ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                <SelectEnumItem icon={HOST_ROLE_ICONS[r]} label={r} />
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Host (optional)"
            size="small"
            value={s.host ?? ""}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { host: ev.target.value.trim() || null })
            }
            fullWidth
          />
          <TextField
            label="Duration days (e.g. 14 or 14-21)"
            size="small"
            value={daysText(s.durationDays)}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { durationDays: parseDays(ev.target.value) })
            }
            fullWidth
          />
          <TextField
            label="Transmission into this stage"
            size="small"
            value={s.transmission ?? ""}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { transmission: ev.target.value.trim() || null })
            }
            fullWidth
          />
          <TextField
            label="Study note"
            size="small"
            value={s.note ?? ""}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { note: ev.target.value.trim() || null })
            }
            fullWidth
          />
          <TextField
            label="Image id"
            size="small"
            value={s.imageId ?? ""}
            disabled={disabled}
            onChange={(ev) =>
              update(i, { imageId: ev.target.value.trim() || null })
            }
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={s.infective}
                  disabled={disabled}
                  onChange={(ev) => update(i, { infective: ev.target.checked })}
                />
              }
              label="Infective"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={s.diagnostic}
                  disabled={disabled}
                  onChange={(ev) =>
                    update(i, { diagnostic: ev.target.checked })
                  }
                />
              }
              label="Diagnostic"
            />
          </Stack>
        </Box>
      ))}
      <Button
        variant="outlined"
        disabled={disabled}
        onClick={() => onChange([...stages, emptyStage()])}
        sx={{ textTransform: "none" }}
      >
        Add stage
      </Button>
    </Stack>
  );
}
