import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import BoardTile from "./board/BoardTile";
import LibraryBoard from "./board/LibraryBoard";

export type MagazineEmptyCreate = {
  title: string;
  meta: string;
  openLabel: string;
  onCreate: () => void;
};

type MagazineEmptyStageProps = {
  title: string;
  description: string;
  boardAriaLabel: string;
  create?: MagazineEmptyCreate;
};

export default function MagazineEmptyStage({
  title,
  description,
  boardAriaLabel,
  create,
}: MagazineEmptyStageProps) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2.5,
        py: 2,
      }}
    >
      <Box
        sx={{
          textAlign: "center",
          px: 2,
          maxWidth: 420,
        }}
      >
        <Typography
          component="p"
          sx={{
            m: 0,
            mb: 0.75,
            fontSize: "0.6875rem",
            fontWeight: 500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "primary.main",
          }}
        >
          Get started
        </Typography>
        <Typography
          variant="h5"
          component="p"
          sx={{
            m: 0,
            fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
            fontWeight: 400,
            letterSpacing: "0.02em",
            lineHeight: 1.2,
            color: "text.primary",
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, lineHeight: 1.5 }}
        >
          {description}
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          maxWidth: { xs: 168, sm: 180, md: 200 },
        }}
      >
        <LibraryBoard aria-label={boardAriaLabel}>
          {create ? (
            <Box
              component="li"
              sx={{ listStyle: "none", m: 0, p: 0, minHeight: 0 }}
            >
              <BoardTile
                index={0}
                title={create.title}
                meta={create.meta}
                create
                accent
                onCreate={create.onCreate}
                openLabel={create.openLabel}
              />
            </Box>
          ) : null}
        </LibraryBoard>
      </Box>
    </Box>
  );
}
