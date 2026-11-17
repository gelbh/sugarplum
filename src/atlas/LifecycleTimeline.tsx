import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { termLabel } from "./filter";
import {
  windowLit,
  type Axis,
  type DaySpan,
  type DetectableWindow,
  type HostRole,
  type PppBracket,
} from "./lifecycle";

export const MARKER_MS = 300;
export const LABEL_COL = { xs: "120px", sm: "148px" };
// Phones scroll the board; room for badges on stage cards.
export const STAGE_MIN_PX = { xs: 112, sm: 96 };

export const laneWash = (role: HostRole | null, primary: string) => {
  if (role === null) return "transparent";
  return alpha(primary, 0.04);
};

export const motion = (props: string) => ({
  transition: props
    .split(",")
    .map((p) => `${p.trim()} ${MARKER_MS}ms cubic-bezier(0.2, 0, 0, 1)`)
    .join(", "),
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
});

export const pct = (day: number, ax: Axis) => `${(day / ax.endDay) * 100}%`;

export function spanLabel(span: DaySpan, ax: Axis): string {
  const at = (day: number) =>
    ax.unit === "weeks" ? Math.round(day / 7) : Math.round(day);
  const word = ax.unit === "weeks" ? "Week" : "Day";
  if (span.endDay >= ax.endDay) return `${word} ${at(span.startDay)} onwards`;
  return `${word}s ${at(span.startDay)} to ${at(span.endDay)}`;
}

export function Timeline({
  axis: ax,
  ppp,
  windows,
  span,
  emphasizePpp = false,
}: {
  axis: Axis;
  ppp: PppBracket | null;
  windows: DetectableWindow[];
  span: DaySpan | null;
  emphasizePpp?: boolean;
}) {
  const unit = ax.unit === "weeks" ? "Weeks" : "Days";
  const rows = ["18px", "22px", ...(ppp ? ["30px"] : []), "auto"];
  return (
    <Box
      sx={{
        mt: 1.5,
        position: "relative",
        display: "grid",
        gridTemplateRows: rows.join(" "),
        gridTemplateColumns: {
          xs: `${LABEL_COL.xs} minmax(0, 1fr)`,
          sm: `${LABEL_COL.sm} minmax(0, 1fr)`,
        },
        rowGap: 0.75,
        alignItems: "center",
      }}
    >
      <Box />
      <Typography
        aria-hidden
        sx={{
          justifySelf: "end",
          mr: 1.5,
          fontSize: "0.74rem",
          fontWeight: 700,
          color: "primary.main",
          fontVariantNumeric: "tabular-nums",
          opacity: span ? 1 : 0,
          ...motion("opacity"),
        }}
      >
        {span ? spanLabel(span, ax) : "\u00a0"}
      </Typography>
      {/* Absolutely placed in the grid area, so it spans the rows without taking a cell. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          gridColumn: 2,
          gridRow: "2 / -1",
          top: -4,
          bottom: -4,
          left: 0,
          right: 12,
          transformOrigin: "left",
          transform: span
            ? `translateX(${(span.startDay / ax.endDay) * 100}%) scaleX(${
                (span.endDay - span.startDay) / ax.endDay || 0.01
              })`
            : "none",
          opacity: span ? 1 : 0,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
          boxShadow: (t) =>
            `inset 1.5px 0 0 ${t.palette.primary.main}, inset -1.5px 0 0 ${t.palette.primary.main}`,
          pointerEvents: "none",
          ...motion("transform, opacity"),
        }}
      />
      <Typography
        color="text.secondary"
        sx={{ fontSize: "0.76rem", lineHeight: 1.25, pr: 1.5 }}
      >
        {unit} from infection
      </Typography>
      <Box
        sx={{
          position: "relative",
          height: 22,
          borderBottom: 1,
          borderColor: "divider",
          mr: 1.5,
        }}
      >
        {ax.ticks.map((t, i) => (
          <Typography
            key={t.day}
            component="span"
            color="text.secondary"
            sx={{
              position: "absolute",
              left: pct(t.day, ax),
              transform:
                i === 0
                  ? "none"
                  : i === ax.ticks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              fontSize: "0.74rem",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </Typography>
        ))}
      </Box>

      {ppp ? (
        <>
          <Box />
          <Box sx={{ position: "relative", height: 30, mr: 1.5 }}>
            <Box
              sx={{
                position: "absolute",
                left: 0,
                width: pct(ppp.endDay, ax),
                top: 0,
                height: 10,
                border: emphasizePpp ? "2px solid" : "1.5px solid",
                borderTop: 0,
                borderColor: emphasizePpp ? "primary.main" : "text.primary",
                borderRadius: "0 0 3px 3px",
              }}
            />
            <Typography
              component="span"
              sx={{
                position: "absolute",
                left: 0,
                width: pct(ppp.endDay, ax),
                minWidth: "max-content",
                top: 12,
                textAlign: "center",
                fontSize: "0.74rem",
                fontWeight: 700,
                color: emphasizePpp ? "primary.main" : "text.primary",
              }}
            >
              {ppp.label}
            </Typography>
          </Box>
        </>
      ) : null}

      <Typography sx={{ fontWeight: 600, fontSize: "0.84rem", pr: 1.5 }}>
        Detectable
      </Typography>
      <Box
        sx={{
          position: "relative",
          minHeight: 30,
          mr: 1.5,
          display: "grid",
          gap: 0.5,
        }}
      >
        {windows.length === 0 ? (
          <Typography color="text.secondary" sx={{ fontSize: "0.8rem" }}>
            No test windows recorded
          </Typography>
        ) : (
          windows.map((w, wi) => {
            const lit = windowLit(w, span);
            // Late windows label from their right edge so the text stays on the axis.
            const late = w.startDay / ax.endDay > 0.55;
            return (
              <Box
                key={`${w.name}-${wi}`}
                sx={{ position: "relative", height: 28 }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: pct(w.startDay, ax),
                    width: pct(w.endDay - w.startDay, ax),
                    top: 0,
                    bottom: 0,
                    borderRadius: 1,
                    overflow: "hidden",
                    // currentColor follows the active scheme; theme callbacks resolve to the light palette.
                    color: "text.primary",
                    background:
                      "repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 14%, transparent) 0 6px, color-mix(in srgb, currentColor 5%, transparent) 6px 12px)",
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      position: "absolute",
                      inset: 0,
                      background: (t) =>
                        `repeating-linear-gradient(135deg, ${alpha(
                          t.palette.primary.main,
                          0.28,
                        )} 0 6px, ${alpha(t.palette.primary.main, 0.1)} 6px 12px)`,
                      boxShadow: (t) =>
                        `inset 0 0 0 1.5px ${t.palette.primary.main}`,
                      borderRadius: 1,
                      opacity: lit ? 1 : 0,
                      ...motion("opacity"),
                    }}
                  />
                </Box>
                <Typography
                  component="span"
                  sx={{
                    position: "absolute",
                    top: 4,
                    ...(late
                      ? { right: 0, pr: 1 }
                      : { left: pct(w.startDay, ax), pl: 1 }),
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "text.primary",
                    whiteSpace: "nowrap",
                  }}
                >
                  {termLabel(w.name)}
                  {w.sample ? (
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 400,
                        color: "text.secondary",
                        display: { xs: "none", sm: "inline" },
                      }}
                    >
                      {" "}
                      ({w.sample}
                      {w.openEnded ? ", onwards" : ""})
                    </Box>
                  ) : null}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
