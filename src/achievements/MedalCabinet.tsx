import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import DialogEyebrow from "../shared/ui/DialogEyebrow";
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
          // px: MUI sx maps width:1 → 100%.
          left: "11px",
          top: "10px",
          bottom: "10px",
          width: "1px",
          bgcolor: "rgba(196, 165, 116, 0.35)",
        },
      }}
    >
      {items.map((item, index) => {
        const done = item.completedAt != null;
        const focus =
          index === focusIndex || (focusIndex < 0 && index === items.length - 1);
        const snippet = !done ? progressSnippet(item.progress) : null;
        return (
          <Box
            component="li"
            key={item.def.id}
            sx={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              columnGap: 1,
              alignItems: "start",
              py: 0.7,
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
            <Box sx={{ minWidth: 0, pt: focus ? 0.1 : 0.3 }}>
              <Typography
                sx={{
                  fontFamily: focus
                    ? '"Alice", "Georgia", "Times New Roman", serif'
                    : "inherit",
                  fontSize: focus ? "0.95rem" : "0.82rem",
                  fontWeight: focus ? 400 : 500,
                  lineHeight: 1.25,
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
              <Typography
                variant="body2"
                sx={{
                  mt: 0.2,
                  color: "text.secondary",
                  fontSize: "0.78rem",
                  lineHeight: 1.35,
                }}
              >
                {item.def.description}
              </Typography>
              {snippet ? (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 0.35,
                    color: "secondary.main",
                    fontSize: "0.72rem",
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
  selected,
  onOpen,
  sheenIds,
}: {
  items: AchievementItem[];
  selected: boolean;
  onOpen: () => void;
  sheenIds: ReadonlySet<string>;
}) {
  const held = heldMedal(items);
  const unlocked = items.filter((item) => item.completedAt != null).length;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const heldUnlocked = held.completedAt != null;
  const dialogId = `medal-ladder-${held.def.fruitType}`;

  return (
    <Box
      className="medal-tile"
      sx={(theme) => ({
        border: "1px solid",
        borderColor: selected
          ? "secondary.main"
          : heldUnlocked
            ? "rgba(196, 165, 116, 0.42)"
            : "rgba(232, 216, 199, 0.1)",
        borderRadius: 1.5,
        minWidth: 0,
        minHeight: 118,
        position: "relative",
        overflow: "hidden",
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
          borderColor: heldUnlocked
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
        aria-haspopup="dialog"
        aria-expanded={selected}
        aria-controls={selected ? dialogId : undefined}
        aria-label={`${held.def.title}, ${unlocked} of ${items.length}. ${held.def.description}`}
        onClick={onOpen}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.35,
          p: 1,
          m: 0,
          border: 0,
          bgcolor: "transparent",
          color: "inherit",
          font: "inherit",
          textAlign: "center",
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
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            py: 0.35,
            minHeight: 52,
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
            width: "100%",
            fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
            fontWeight: 400,
            letterSpacing: "0.02em",
            fontSize: "0.82rem",
            lineHeight: 1.25,
            minHeight: "2.5em",
            textAlign: "center",
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
            justifyContent: "center",
            minHeight: 18,
            mt: "auto",
          }}
        >
          <ProgressMark
            unlocked={unlocked}
            total={items.length}
            heldUnlocked={heldUnlocked}
          />
        </Box>
      </Box>
    </Box>
  );
}

function FruitLadderDialog({
  open,
  onClose,
  items,
  sheenIds,
}: {
  open: boolean;
  onClose: () => void;
  items: AchievementItem[];
  sheenIds: ReadonlySet<string>;
}) {
  if (items.length === 0) return null;
  const held = heldMedal(items);
  const unlocked = items.filter((item) => item.completedAt != null).length;
  const focus =
    items.find((item) => item.completedAt == null) ?? items[items.length - 1]!;
  const allDone = unlocked === items.length;
  const focusLine = allDone
    ? `Done · ${focus.def.description}`
    : `Next · ${focus.def.description}`;
  const dialogId = `medal-ladder-${held.def.fruitType}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      transitionDuration={0}
      aria-labelledby={`${dialogId}-title`}
      slotProps={{
        paper: {
          sx: (theme) => ({
            borderRadius: 2,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "rgba(196, 165, 116, 0.28)",
            ...theme.applyStyles("dark", {
              bgcolor: "#1e0d1b",
              backgroundImage:
                "linear-gradient(180deg, rgba(196, 165, 116, 0.06) 0%, transparent 42%)",
            }),
          }),
        },
      }}
    >
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          borderBottom: "1px solid",
          borderColor: "rgba(232, 216, 199, 0.1)",
        }}
      >
        <DialogEyebrow label="Fruit" />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <FruitMedal
            fruitType={held.def.fruitType}
            traits={held.traits}
            size={48}
            locked={held.completedAt == null}
            sheenOnce={sheenIds.has(held.def.id)}
          />
          <Box sx={{ minWidth: 0 }}>
            <DialogTitle
              id={`${dialogId}-title`}
              sx={{
                p: 0,
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                fontWeight: 400,
                letterSpacing: "0.02em",
                lineHeight: 1.15,
                fontSize: "1.6rem",
              }}
            >
              {held.def.title}
            </DialogTitle>
            <Typography
              variant="body2"
              sx={{ color: "secondary.main", mt: 0.35 }}
            >
              {unlocked} of {items.length} collected
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 0.55,
                lineHeight: 1.35,
                maxWidth: "36ch",
              }}
            >
              {focusLine}
            </Typography>
          </Box>
        </Box>
      </Box>
      <DialogContent sx={{ px: 3, pt: 2, pb: 2.5 }}>
        <FruitStem items={items} sheenIds={sheenIds} />
      </DialogContent>
    </Dialog>
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
      selected={openFruit === fruit}
      onOpen={() => setOpenFruit(fruit)}
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
  const head = rem > 0 ? fruits.slice(0, -rem) : fruits;
  const tail = rem > 0 ? fruits.slice(-rem) : [];
  const openItems = openFruit ? (grouped.get(openFruit) ?? []) : [];

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
            "& > .medal-tile": {
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
      <FruitLadderDialog
        open={openFruit != null && openItems.length > 0}
        onClose={() => setOpenFruit(null)}
        items={openItems}
        sheenIds={sheenIds}
      />
    </Box>
  );
}
