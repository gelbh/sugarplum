import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

const THUMB_CSS_WIDTH = 72;

export default function FigureSuggestFilmstrip({
  scanCount,
  activePage,
  thumbUrls,
  disabled,
  onSelectPage,
}: {
  scanCount: number;
  activePage: number;
  thumbUrls: (string | null)[];
  disabled: boolean;
  onSelectPage: (pageIndex: number) => void;
}) {
  if (scanCount <= 0) return null;

  return (
    <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
      {Array.from({ length: scanCount }, (_, i) => (
        <Box
          key={i}
          component="button"
          type="button"
          disabled={disabled}
          onClick={() => onSelectPage(i)}
          sx={{
            border: activePage === i ? "2px solid" : "1px solid",
            borderColor: activePage === i ? "primary.main" : "divider",
            borderRadius: 1,
            p: 0.25,
            bgcolor: "background.paper",
            cursor: disabled ? "default" : "pointer",
            flexShrink: 0,
            lineHeight: 0,
          }}
        >
          {thumbUrls[i] ? (
            <Box
              component="img"
              src={thumbUrls[i]!}
              alt={`Page ${i + 1}`}
              sx={{ width: THUMB_CSS_WIDTH, display: "block" }}
            />
          ) : (
            <Box
              sx={{
                width: THUMB_CSS_WIDTH,
                height: THUMB_CSS_WIDTH * 1.3,
                display: "grid",
                placeItems: "center",
              }}
            >
              <Typography variant="caption">{i + 1}</Typography>
            </Box>
          )}
        </Box>
      ))}
    </Stack>
  );
}
