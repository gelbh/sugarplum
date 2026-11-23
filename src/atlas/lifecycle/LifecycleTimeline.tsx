import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { termLabel } from "../lib/labels";
import {
  type Axis,
  type DetectableWindow,
  type HostRole,
  type PppBracket,
} from "./lifecycle";

export const LABEL_COL = { xs: "120px", sm: "148px" };
// Phones scroll the board; slim navigator cells (prose lives in the panel).
export const STAGE_MIN_PX = { xs: 96, sm: 88 };

export const laneWash = (role: HostRole | null, primary: string) => {
  if (role === null) return "transparent";
  return alpha(primary, 0.04);
};

export const pct = (day: number, ax: Axis) => `${(day / ax.endDay) * 100}%`;

export function Timeline({
  axis: ax,
  ppp,
  windows,
}: {
  axis: Axis;
  ppp: PppBracket | null;
  windows: DetectableWindow[];
}) {
  const unit = ax.unit === "weeks" ? "Weeks" : "Days";
  const rows = ["22px", ...(ppp ? ["30px"] : []), "auto"];
  return (
    <Box
      sx={{
        mt: 2,
        pt: 1.5,
        borderTop: 1,
        borderColor: "divider",
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
      <Typography
        sx={{
          fontSize: "0.68rem",
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "text.secondary",
          lineHeight: 1.25,
          pr: 1.5,
        }}
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
            sx={{
              color: "text.secondary",
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
              whiteSpace: "nowrap"
            }}>
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
                border: "1.5px solid",
                borderTop: 0,
                borderColor: "text.primary",
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
                color: "text.primary",
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
          <Typography
            sx={{
              color: "text.secondary",
              fontSize: "0.8rem"
            }}>
            No test windows recorded
          </Typography>
        ) : (
          windows.map((w, wi) => {
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
                />
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
