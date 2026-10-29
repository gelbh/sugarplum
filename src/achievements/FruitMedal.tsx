import Box from "@mui/material/Box";
import type { FruitType } from "./catalog";
import { cssFilterFromTraits } from "./medalFilters";
import type { FruitTraits } from "./traits";

export type FruitMedalProps = {
  fruitType: FruitType;
  traits: FruitTraits;
  size: number;
  locked?: boolean;
  /** Legendary gallery first paint only; one-shot sheen, no loop. */
  sheenOnce?: boolean;
};

const sheenKeyframes = {
  "@keyframes fruitMedalSheen": {
    "0%": { opacity: 0 },
    "35%": { opacity: 0.55 },
    "100%": { opacity: 0 },
  },
};

export default function FruitMedal({
  fruitType,
  traits,
  size,
  locked = false,
  sheenOnce = false,
}: FruitMedalProps) {
  const filter = cssFilterFromTraits(traits, { locked });

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        ...sheenKeyframes,
      }}
    >
      <Box
        component="img"
        src={`/achievements/fruits/${fruitType}.svg`}
        alt=""
        draggable={false}
        sx={{
          width: "100%",
          height: "100%",
          display: "block",
          filter,
          opacity: locked ? 0.45 : 1,
          transition:
            "filter 600ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease",
          "@media (prefers-reduced-motion: reduce)": {
            transition: "filter 200ms ease, opacity 200ms ease",
          },
        }}
      />
      {sheenOnce ? (
        <Box
          aria-hidden
          sx={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
            opacity: 0,
            animation: "fruitMedalSheen 900ms ease-out 1 forwards",
            "@media (prefers-reduced-motion: reduce)": {
              animation: "fruitMedalSheen 400ms ease-out 1 forwards",
              background:
                "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
            },
          }}
        />
      ) : null}
    </Box>
  );
}

/** Ripening medal for unlock toast (starts dim, animates to full traits). */
export function RipeningFruitMedal({
  fruitType,
  traits,
  size,
  ripe,
}: {
  fruitType: FruitType;
  traits: FruitTraits;
  size: number;
  ripe: boolean;
}) {
  const filter = cssFilterFromTraits(traits, {
    locked: !ripe,
    ripen: ripe,
  });

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <Box
        component="img"
        src={`/achievements/fruits/${fruitType}.svg`}
        alt=""
        draggable={false}
        sx={{
          width: "100%",
          height: "100%",
          display: "block",
          filter,
          opacity: ripe ? 1 : 0.5,
          transition:
            "filter 650ms cubic-bezier(0.16, 1, 0.3, 1), opacity 550ms cubic-bezier(0.16, 1, 0.3, 1)",
          "@media (prefers-reduced-motion: reduce)": {
            transition: "filter 200ms ease, opacity 200ms ease",
          },
        }}
      />
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          inset: -4,
          borderRadius: 2,
          bgcolor: "rgba(196, 165, 116, 0)",
          transition: "background-color 650ms cubic-bezier(0.16, 1, 0.3, 1)",
          ...(ripe
            ? {
                bgcolor: "rgba(196, 165, 116, 0.22)",
              }
            : {}),
          "@media (prefers-reduced-motion: reduce)": {
            transition: "background-color 200ms ease",
          },
        }}
      />
    </Box>
  );
}
