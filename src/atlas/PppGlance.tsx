import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

type Props = {
  min: number;
  max: number;
};

/** Compact infection → patent rail: hero range + only the PPP window filled. */
export default function PppGlance({ min, max }: Props) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  // Pad past max so "patent" sits clearly after the window.
  const axis = Math.max(hi * 1.3, hi + 12, 36);
  const startPct = (lo / axis) * 100;
  const endPct = (hi / axis) * 100;
  const widthPct = Math.max(endPct - startPct, lo === hi ? 1.8 : 3);
  const label = lo === hi ? `${lo} days` : `${lo}–${hi} days`;

  return (
    <Box sx={{ mt: 0.35, minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: "1.35rem",
          fontWeight: 750,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {label}
      </Typography>

      <Box
        role="img"
        aria-label={`Prepatent period ${label}, from infection to patent`}
        sx={{ mt: 1.25, minWidth: 0 }}
      >
        {/* Track + window */}
        <Box sx={{ position: "relative", height: 10, mx: 0.25 }}>
          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 2,
              mt: "-1px",
              borderRadius: 1,
              bgcolor: "divider",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              left: `${startPct}%`,
              width: `${widthPct}%`,
              top: 0,
              bottom: 0,
              borderRadius: 1,
              bgcolor: "primary.main",
            }}
          />
          {/* End caps on the window */}
          <Box
            sx={{
              position: "absolute",
              left: `${startPct}%`,
              top: -2,
              width: 2,
              height: 14,
              borderRadius: 1,
              bgcolor: "primary.main",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              left: `calc(${startPct}% + ${widthPct}% - 2px)`,
              top: -2,
              width: 2,
              height: 14,
              borderRadius: 1,
              bgcolor: "primary.main",
            }}
          />
        </Box>

        {/* Day ticks under the rail */}
        <Box sx={{ position: "relative", height: 16, mt: 0.35, mx: 0.25 }}>
          <Tick pct={0} label="0" align="left" />
          <Tick
            pct={startPct}
            label={String(lo)}
            align={startPct < 12 ? "left" : "center"}
          />
          {lo !== hi ? (
            <Tick
              pct={endPct}
              label={String(hi)}
              align={endPct > 88 ? "right" : "center"}
            />
          ) : null}
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mt: 0.35,
            px: 0.15,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "text.secondary",
            }}
          >
            Infection
          </Typography>
          <Typography
            sx={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "text.secondary",
            }}
          >
            Patent
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function Tick({
  pct,
  label,
  align,
}: {
  pct: number;
  label: string;
  align: "left" | "center" | "right";
}) {
  const transform =
    align === "left"
      ? "none"
      : align === "right"
        ? "translateX(-100%)"
        : "translateX(-50%)";
  return (
    <Typography
      component="span"
      sx={{
        position: "absolute",
        left: `${pct}%`,
        transform,
        fontSize: "0.68rem",
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        color: "text.secondary",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Typography>
  );
}
