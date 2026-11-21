import { useRef, useState, type KeyboardEvent } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AchievementRow from "./AchievementRow";
import { FRUIT_ORDER, type FruitType } from "./catalog";
import FruitMedal from "./FruitMedal";
import type { AchievementItem } from "./wire";

function groupByFruit(
  items: AchievementItem[],
): Map<FruitType, AchievementItem[]> {
  const map = new Map<FruitType, AchievementItem[]>();
  for (const fruit of FRUIT_ORDER) map.set(fruit, []);
  for (const item of items) map.get(item.def.fruitType)?.push(item);
  for (const list of map.values()) {
    list.sort((a, b) => a.def.sortOrder - b.def.sortOrder);
  }
  return map;
}

function heldMedal(items: AchievementItem[]): AchievementItem {
  let held = items[0]!;
  for (const item of items) {
    if (item.completedAt != null) held = item;
  }
  return held;
}

const CABINET_COLUMNS = 3;

function withOpenTileOnRowStart(
  fruits: FruitType[],
  open: FruitType | null,
): FruitType[] {
  if (open == null) return fruits;
  const index = fruits.indexOf(open);
  const offset = index % CABINET_COLUMNS;
  if (index < 1 || offset === 0) return fruits;
  const next = fruits.slice();
  const start = index - offset;
  const picked = next[index]!;
  for (let i = index; i > start; i -= 1) next[i] = next[i - 1]!;
  next[start] = picked;
  return next;
}

function MedalTile({
  items,
  open,
  onToggle,
  sheenIds,
}: {
  items: AchievementItem[];
  open: boolean;
  onToggle: () => void;
  sheenIds: ReadonlySet<string>;
}) {
  const held = heldMedal(items);
  const unlocked = items.filter((item) => item.completedAt != null).length;
  const panelId = `medal-ladder-${held.def.fruitType}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rest = items.filter((item) => item.def.id !== held.def.id);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    onToggle();
    buttonRef.current?.focus();
  }

  const heldUnlocked = held.completedAt != null;

  return (
    <Box
      className="medal-tile"
      onKeyDown={onKeyDown}
      sx={(theme) => ({
        gridColumn: open ? "1 / -1" : undefined,
        border: 1,
        borderColor: open
          ? "primary.main"
          : heldUnlocked
            ? "rgba(196, 165, 116, 0.42)"
            : "divider",
        borderRadius: 2,
        bgcolor: "background.paper",
        minWidth: 0,
        position: "relative",
        overflow: "hidden",
        transition:
          "border-color 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        ...theme.applyStyles("dark", {
          bgcolor: heldUnlocked
            ? "rgba(196, 165, 116, 0.07)"
            : "rgba(232, 216, 199, 0.045)",
          boxShadow: heldUnlocked
            ? "0 10px 28px rgba(0, 0, 0, 0.22)"
            : "none",
        }),
        "&:hover": {
          borderColor: open ? "primary.main" : "secondary.main",
          ...theme.applyStyles("dark", {
            bgcolor: "rgba(196, 165, 116, 0.1)",
          }),
        },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
      })}
    >
      <Tooltip describeChild title={held.def.description}>
        <Box
          component="button"
          type="button"
          ref={buttonRef}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 0.35,
            p: 1.35,
            m: 0,
            border: 0,
            bgcolor: "transparent",
            color: "inherit",
            font: "inherit",
            textAlign: "left",
            cursor: "pointer",
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: "-2px",
            },
          }}
        >
          <Box
            sx={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              py: 0.5,
              borderRadius: 1.5,
              background:
                "radial-gradient(ellipse 70% 80% at 50% 55%, rgba(196, 165, 116, 0.14) 0%, transparent 70%)",
            }}
          >
            <FruitMedal
              fruitType={held.def.fruitType}
              traits={held.traits}
              size={64}
              locked={held.completedAt == null}
              sheenOnce={sheenIds.has(held.def.id)}
            />
          </Box>
          <Typography
            component="span"
            variant="subtitle2"
            sx={{
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              fontSize: "0.98rem",
            }}
          >
            {held.def.title}
          </Typography>
          <Box
            sx={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: heldUnlocked ? "secondary.main" : "text.secondary",
                fontWeight: heldUnlocked ? 600 : 400,
              }}
            >
              {unlocked} of {items.length}
            </Typography>
            <ExpandMoreIcon
              fontSize="small"
              sx={{
                color: "text.secondary",
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                },
              }}
            />
          </Box>
        </Box>
      </Tooltip>
      {open ? (
        <Box id={panelId} sx={{ px: 1.25, pb: 1.25 }}>
          {rest.map((item) => (
            <AchievementRow
              key={item.def.id}
              item={item}
              staggerIndex={0}
              sheenOnce={sheenIds.has(item.def.id)}
              descriptionMode="hover"
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export default function MedalCabinet({
  items,
  sheenIds,
}: {
  items: AchievementItem[];
  sheenIds: ReadonlySet<string>;
}) {
  const [openFruit, setOpenFruit] = useState<FruitType | null>(null);
  const grouped = groupByFruit(items);
  const fruits = FRUIT_ORDER.filter((fruit) => (grouped.get(fruit) ?? []).length > 0);
  // A spanning tile past column 1 leaves empty cells on its row.
  const ordered = withOpenTileOnRowStart(fruits, openFruit);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 1.25,
      }}
    >
      {ordered.map((fruit) => {
        const list = grouped.get(fruit) ?? [];
        return (
          <MedalTile
            key={fruit}
            items={list}
            open={openFruit === fruit}
            onToggle={() =>
              setOpenFruit((current) => (current === fruit ? null : fruit))
            }
            sheenIds={sheenIds}
          />
        );
      })}
    </Box>
  );
}
