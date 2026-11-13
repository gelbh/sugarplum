import { useState, type MouseEvent, type ReactNode } from "react";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { anatomyHubHref } from "../anatomy/paths";
import { isGuest } from "../guest/session";
import { isPlainClick, navigate } from "../nav/navigate";
import ParasitologyAtlasBounce from "./ParasitologyAtlasBounce";

type DisciplineCard = {
  id: "anatomy" | "parasitology";
  title: string;
  blurb: string;
  icon: ReactNode;
};

const CARDS: DisciplineCard[] = [
  {
    id: "anatomy",
    title: "Anatomy",
    blurb: "Interactive 3D osteology scenes by species.",
    icon: <ViewInArOutlinedIcon aria-hidden />,
  },
  {
    id: "parasitology",
    title: "Parasitology",
    blurb: "Your parasite cabinet, entries, and compare views.",
    icon: <BugReportOutlinedIcon aria-hidden />,
  },
];

export default function AtlasHub() {
  const [openParasitology, setOpenParasitology] = useState(false);
  const guest = isGuest();

  if (openParasitology) {
    return (
      <ParasitologyAtlasBounce onBack={() => setOpenParasitology(false)} />
    );
  }

  const onAnatomy = (ev: MouseEvent) => {
    if (!isPlainClick(ev)) return;
    ev.preventDefault();
    navigate(anatomyHubHref());
  };

  const onParasitology = (ev: MouseEvent) => {
    if (!isPlainClick(ev)) return;
    ev.preventDefault();
    if (guest) {
      window.location.assign("/login");
      return;
    }
    setOpenParasitology(true);
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 600 }}
          >
            Atlas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose a discipline to study.
          </Typography>
        </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          useFlexGap
          sx={{ alignItems: "stretch" }}
        >
          {CARDS.map((card) => {
            const isAnatomy = card.id === "anatomy";
            const href = isAnatomy ? anatomyHubHref() : guest ? "/login" : null;
            return (
              <ButtonBase
                key={card.id}
                focusRipple
                {...(href ? { href } : {})}
                onClick={(ev) => {
                  if (isAnatomy) {
                    onAnatomy(ev);
                    return;
                  }
                  onParasitology(ev);
                }}
                sx={{
                  flex: 1,
                  display: "block",
                  textAlign: "left",
                  borderRadius: 1,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  px: 2.5,
                  py: 2.5,
                  transition:
                    "border-color 160ms ease-out, background-color 160ms ease-out",
                  "&:hover": {
                    borderColor: "primary.main",
                    bgcolor: "action.hover",
                  },
                  "&.Mui-focusVisible": {
                    outline: "2px solid",
                    outlineColor: "primary.main",
                    outlineOffset: 2,
                  },
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      color: "primary.main",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 0,
                      flexShrink: 0,
                      "& .MuiSvgIcon-root": { fontSize: 28 },
                    }}
                  >
                    {card.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      component="h2"
                      variant="h6"
                      sx={{ fontWeight: 600 }}
                    >
                      {card.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.75 }}
                    >
                      {isAnatomy
                        ? card.blurb
                        : guest
                          ? "Sign in to open your Parasitology Atlas."
                          : card.blurb}
                    </Typography>
                  </Box>
                </Stack>
              </ButtonBase>
            );
          })}
        </Stack>
      </Stack>
    </Container>
  );
}
