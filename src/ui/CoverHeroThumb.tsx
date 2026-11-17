import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type CoverHeroCredit = {
  photographerName: string;
  photographerUrl: string;
};

export type CoverHeroThumbProps = {
  src?: string | null;
  placeholderColor: string;
  interactive: boolean;
  onChangeCover?: () => void;
  ariaLabel?: string;
  credit?: CoverHeroCredit | null;
};

export default function CoverHeroThumb({
  src,
  placeholderColor,
  interactive,
  onChangeCover,
  ariaLabel,
  credit = null,
}: CoverHeroThumbProps) {
  return (
    <Stack
      spacing={0.75}
      alignItems="stretch"
      sx={{ flexShrink: 0, width: { xs: 104, sm: 132 } }}
    >
      <Box
        component={interactive ? ButtonBase : "div"}
        {...(interactive
          ? {
              focusRipple: true,
              onClick: onChangeCover,
              "aria-label": ariaLabel,
            }
          : {})}
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 2,
          overflow: "hidden",
          border: 1,
          borderColor: "rgba(232, 216, 199, 0.16)",
          bgcolor: placeholderColor,
          boxShadow: "0 14px 36px rgba(0,0,0,0.42)",
          textAlign: "left",
          display: "block",
          transition: "transform 180ms ease, box-shadow 180ms ease",
          ...(interactive
            ? {
                "&:hover, &:focus-visible": {
                  transform: "translateY(-2px) scale(1.02)",
                  boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
                },
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                  "&:hover, &:focus-visible": {
                    transform: "none",
                  },
                },
              }
            : {
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                },
              }),
        }}
      >
        {src ? (
          <Box
            component="img"
            src={src}
            alt=""
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : null}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 42%, rgba(15, 5, 14, 0.82) 100%)",
            pointerEvents: "none",
          }}
        />
      </Box>
      {credit ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            display: "block",
            lineHeight: 1.35,
            px: 0.25,
          }}
        >
          Photo by{" "}
          <Link
            href={credit.photographerUrl}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ color: "inherit" }}
          >
            {credit.photographerName}
          </Link>
        </Typography>
      ) : null}
    </Stack>
  );
}
