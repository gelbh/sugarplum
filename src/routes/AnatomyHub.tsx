import AgricultureOutlinedIcon from "@mui/icons-material/AgricultureOutlined";
import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MouseEvent, ReactNode } from "react";
import { ANATOMY_CATALOG } from "../anatomy/catalog";
import { anatomySceneHref } from "../anatomy/paths";
import { atlasHubHref } from "../atlas/paths";
import HubNavCard from "../components/HubNavCard";
import { isPlainClick, navigate } from "../nav/navigate";

const SPECIES_ICON: Record<string, ReactNode> = {
  canine: <PetsOutlinedIcon aria-hidden />,
  equine: <ViewInArOutlinedIcon aria-hidden />,
  bovine: <AgricultureOutlinedIcon aria-hidden />,
};

export default function AnatomyHub() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Link
            href={atlasHubHref()}
            underline="hover"
            variant="body2"
            color="text.secondary"
            onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
              if (!isPlainClick(ev)) return;
              ev.preventDefault();
              navigate(atlasHubHref());
            }}
            sx={{ display: "inline-block", mb: 1 }}
          >
            Atlas
          </Link>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 600 }}
          >
            Anatomy
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Interactive 3D osteology scenes.
          </Typography>
        </Box>
        <Stack spacing={1.5}>
          {ANATOMY_CATALOG.map((entry) => (
            <HubNavCard
              key={entry.id}
              title={entry.title}
              blurb="Region-staged whole-animal osteology"
              icon={
                SPECIES_ICON[entry.id] ?? (
                  <ViewInArOutlinedIcon aria-hidden />
                )
              }
              href={anatomySceneHref(entry.id)}
              onClick={(ev: MouseEvent) => {
                if (!isPlainClick(ev)) return;
                ev.preventDefault();
                navigate(anatomySceneHref(entry.id));
              }}
              layout="list"
            />
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
