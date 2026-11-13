import { useState, type MouseEvent, type ReactNode } from "react";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { anatomyHubHref } from "../anatomy/paths";
import HubNavCard from "../components/HubNavCard";
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
              <HubNavCard
                key={card.id}
                title={card.title}
                blurb={
                  isAnatomy
                    ? card.blurb
                    : guest
                      ? "Sign in to open your Parasitology Atlas."
                      : card.blurb
                }
                icon={card.icon}
                {...(href ? { href } : {})}
                onClick={(ev) => {
                  if (isAnatomy) {
                    onAnatomy(ev);
                    return;
                  }
                  onParasitology(ev);
                }}
                layout="tile"
              />
            );
          })}
        </Stack>
      </Stack>
    </Container>
  );
}
