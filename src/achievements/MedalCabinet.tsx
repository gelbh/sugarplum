import {
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { FRUIT_ORDER, type FruitType } from "./catalog";
import FruitMedal from "./FruitMedal";
import type { AchievementItem, AchievementProgress } from "./wire";

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

function ProgressMark({
  unlocked,
  total,
  heldUnlocked,
}: {
  unlocked: number;
  total: number;
  heldUnlocked: boolean;
}) {
  if (!heldUnlocked && unlocked === 0) {
    return (
      <Box
        aria-hidden
        sx={{
          display: "inline-flex",
          gap: 0.45,
          alignItems: "center",
        }}
      >
        {Array.from({ length: Math.min(total, 5) }, (_, i) => (
          <Box
            key={i}
            sx={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: "rgba(232, 216, 199, 0.28)",
              bgcolor: "transparent",
            }}
          />
        ))}
      </Box>
    );
  }
  return (
    <Typography
      variant="caption"
      sx={{
        color: heldUnlocked ? "secondary.main" : "text.secondary",
        fontWeight: heldUnlocked ? 600 : 400,
      }}
    >
      {unlocked} of {total}
    </Typography>
  );
}

function progressSnippet(progress: AchievementProgress): string | null {
  if (!progress) return null;
  if (progress.kind === "count") {
    return `${progress.currentValue} / ${progress.threshold}`;
  }
  return progress.parts
    .map((part) => `${part.current}/${part.target}`)
    .join(" · ");
}

/** Botanical stem: vine of fruit nodes, next goal only, no bar chrome. */
function FruitStem({
  items,
  sheenIds,
}: {
  items: AchievementItem[];
  sheenIds: ReadonlySet<string>;
}) {
  const focusIndex = items.findIndex((item) => item.completedAt == null);
  return (
    <Box
      component="ol"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        "&::before": {
          content: '""',
          position: "absolute",
          left: 11,
          top: 10,
          bottom: 10,
          width: 1,
          bgcolor: "rgba(196, 165, 116, 0.35)",
        },
      }}
    >
      {items.map((item, index) => {
        const done = item.completedAt != null;
        const focus = index === focusIndex || (focusIndex < 0 && index === items.length - 1);
        const snippet = !done ? progressSnippet(item.progress) : null;
        return (
          <Box
            component="li"
            key={item.def.id}
            sx={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              columnGap: 0.85,
              alignItems: "start",
              py: 0.55,
              opacity: done ? 0.72 : focus ? 1 : 0.45,
            }}
          >
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(28, 16, 28, 0.92)",
              }}
            >
              {done || focus ? (
                <FruitMedal
                  fruitType={item.def.fruitType}
                  traits={item.traits}
                  size={focus ? 22 : 16}
                  locked={!done}
                  sheenOnce={sheenIds.has(item.def.id)}
                />
              ) : (
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    border: "1px solid",
                    borderColor: "rgba(232, 216, 199, 0.35)",
                  }}
                />
              )}
            </Box>
            <Box sx={{ minWidth: 0, pt: focus ? 0.15 : 0.35 }}>
              <Typography
                sx={{
                  fontFamily: focus
                    ? '"Alice", "Georgia", "Times New Roman", serif'
                    : "inherit",
                  fontSize: focus ? "0.82rem" : "0.72rem",
                  fontWeight: focus ? 400 : 500,
                  lineHeight: 1.2,
                  color: done
                    ? "rgba(232, 216, 199, 0.7)"
                    : focus
                      ? "text.primary"
                      : "text.secondary",
                  textDecoration: done ? "line-through" : "none",
                  textDecorationColor: "rgba(196, 165, 116, 0.45)",
                }}
              >
                {item.def.title}
              </Typography>
              {snippet ? (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 0.15,
                    color: "secondary.main",
                    fontSize: "0.68rem",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {snippet}
                </Typography>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
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
        // Expand in-column; full-row span made ladders wider than the content.
        border: "1px solid",
        borderColor: open
          ? "primary.main"
          : heldUnlocked
            ? "rgba(196, 165, 116, 0.42)"
            : "rgba(232, 216, 199, 0.1)",
        borderRadius: 1.5,
        minWidth: 0,
        minHeight: open ? undefined : 118,
        position: "relative",
        overflow: "hidden",
        alignSelf: open ? "start" : undefined,
        transition:
          "border-color 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        ...theme.applyStyles("dark", {
          bgcolor: heldUnlocked
            ? "rgba(196, 165, 116, 0.07)"
            : "rgba(232, 216, 199, 0.028)",
          boxShadow: heldUnlocked
            ? "0 6px 16px rgba(0, 0, 0, 0.16)"
            : "none",
        }),
        "&:hover": {
          borderColor: open
            ? "primary.main"
            : heldUnlocked
              ? "secondary.main"
              : "rgba(232, 216, 199, 0.2)",
          ...theme.applyStyles("dark", {
            bgcolor: heldUnlocked
              ? "rgba(196, 165, 116, 0.11)"
              : "rgba(232, 216, 199, 0.05)",
          }),
        },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
      })}
    >
      <Box
        component="button"
        type="button"
        ref={buttonRef}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${held.def.title}, ${unlocked} of ${items.length}. ${held.def.description}`}
        onClick={onToggle}
        sx={{
          width: "100%",
          height: open ? "auto" : "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 0.25,
          p: 1,
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
        {open ? (
          <Box
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 0.75,
            }}
          >
            <FruitMedal
              fruitType={held.def.fruitType}
              traits={held.traits}
              size={28}
              locked={held.completedAt == null}
              sheenOnce={sheenIds.has(held.def.id)}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  display: "block",
                  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                  fontSize: "0.82rem",
                  lineHeight: 1.2,
                  color: heldUnlocked ? "text.primary" : "text.secondary",
                }}
              >
                {held.def.title}
              </Typography>
              <ProgressMark
                unlocked={unlocked}
                total={items.length}
                heldUnlocked={heldUnlocked}
              />
            </Box>
            <ExpandMoreIcon
              fontSize="small"
              sx={{
                color: "text.secondary",
                opacity: 0.7,
                transform: "rotate(180deg)",
              }}
            />
          </Box>
        ) : (
          <>
            <Box
              sx={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                py: 0.35,
                minHeight: 52,
                alignItems: "center",
              }}
            >
              <Box
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: heldUnlocked
                    ? "radial-gradient(circle at 50% 50%, rgba(196, 165, 116, 0.2) 0%, transparent 68%)"
                    : "transparent",
                }}
              >
                <FruitMedal
                  fruitType={held.def.fruitType}
                  traits={held.traits}
                  size={40}
                  locked={held.completedAt == null}
                  sheenOnce={sheenIds.has(held.def.id)}
                />
              </Box>
            </Box>
            <Typography
              component="span"
              variant="subtitle2"
              sx={{
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                fontWeight: 400,
                letterSpacing: "0.02em",
                fontSize: "0.82rem",
                lineHeight: 1.2,
                minHeight: "2.4em",
                color: heldUnlocked ? "text.primary" : "text.secondary",
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
                minHeight: 18,
                mt: "auto",
              }}
            >
              <ProgressMark
                unlocked={unlocked}
                total={items.length}
                heldUnlocked={heldUnlocked}
              />
              <ExpandMoreIcon
                fontSize="small"
                sx={{
                  color: "text.secondary",
                  opacity: 0.7,
                  transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
                  "@media (prefers-reduced-motion: reduce)": {
                    transition: "none",
                  },
                }}
              />
            </Box>
          </>
        )}
      </Box>
      {open ? (
        <Box
          id={panelId}
          sx={{
            px: 1.1,
            pb: 1.15,
            pt: 0.25,
            borderTop: "1px solid",
            borderColor: "rgba(232, 216, 199, 0.1)",
          }}
        >
          <FruitStem items={items} sheenIds={sheenIds} />
        </Box>
      ) : null}
    </Box>
  );
}

const CABINET_GAP = { xs: 0.85, md: 1 } as const;

function tileFor(
  fruit: FruitType,
  grouped: Map<FruitType, AchievementItem[]>,
  openFruit: FruitType | null,
  setOpenFruit: Dispatch<SetStateAction<FruitType | null>>,
  sheenIds: ReadonlySet<string>,
) {
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
  const fruits = FRUIT_ORDER.filter(
    (fruit) => (grouped.get(fruit) ?? []).length > 0,
  );
  const cols = CABINET_COLUMNS;
  const rem = fruits.length % cols;
  // Closed grid: paired rows + one centered orphan when count is odd.
  const head = rem > 0 ? fruits.slice(0, -rem) : fruits;
  const tail = rem > 0 ? fruits.slice(-rem) : [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: CABINET_GAP }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: CABINET_GAP,
          alignItems: "start",
        }}
      >
        {head.map((fruit) =>
          tileFor(fruit, grouped, openFruit, setOpenFruit, sheenIds),
        )}
      </Box>
      {tail.length > 0 ? (
        <Box
          sx={(theme) => ({
            display: "flex",
            justifyContent: "center",
            gap: CABINET_GAP,
            "& > *": {
              flex: "0 0 auto",
              width: `calc((100% - 2 * ${theme.spacing(1)}) / ${cols})`,
            },
          })}
        >
          {tail.map((fruit) =>
            tileFor(fruit, grouped, openFruit, setOpenFruit, sheenIds),
          )}
        </Box>
      ) : null}
    </Box>
  );
}
