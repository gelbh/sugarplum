import { useEffect, useState, type MouseEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { ApiError, listSubjects, me } from "../api/client";
import { bundledAtlasSource } from "../atlas/bundledSource";
import Cabinet from "../atlas/Cabinet";
import {
  atlasEntryHref,
  atlasHref,
  subjectHref,
  type AtlasRoute,
} from "../atlas/paths";
import type { AtlasEntryView, AtlasSource } from "../atlas/types";
import { isGuest } from "../guest/session";
import { navigate } from "../nav/navigate";

type Props = {
  subjectId: string;
  route: AtlasRoute;
  source?: AtlasSource;
};

type Loaded = {
  entries: AtlasEntryView[];
  userKey: string;
  subjectTitle: string | null;
};

function NavLink({ href, children }: { href: string; children: string }) {
  const onClick = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
      return;
    ev.preventDefault();
    navigate(href);
  };
  return (
    <Link href={href} underline="hover" onClick={onClick}>
      {children}
    </Link>
  );
}

// TODO(tomer): replace with the entry view and Compare when they ship.
const STILL_BUILDING =
  "This view is still being built. The cabinet has the hosts, site and PPP for now.";

function Notice({
  title,
  message = STILL_BUILDING,
  italic,
}: {
  title: string;
  message?: string;
  italic?: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, maxWidth: 560 }}>
      <Typography
        component="h1"
        variant="h5"
        sx={{ fontWeight: 600, fontStyle: italic ? "italic" : undefined }}
      >
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        {message}
      </Typography>
    </Paper>
  );
}

export default function AtlasPage({
  subjectId,
  route,
  source = bundledAtlasSource,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        const [entries, subjects] = await Promise.all([
          source.list(subjectId),
          listSubjects().catch(() => []),
        ]);
        if (cancelled) return;
        setLoaded({
          entries,
          userKey: isGuest() ? "guest" : user.id,
          subjectTitle: subjects.find((s) => s.id === subjectId)?.title ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Could not load the Atlas",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, subjectId]);

  const home = atlasHref(subjectId);
  const crumb =
    route.kind === "cabinet" ? (
      <NavLink href={subjectHref(subjectId)}>
        {loaded?.subjectTitle ?? "Subject"}
      </NavLink>
    ) : (
      <NavLink href={home}>Parasitology Atlas</NavLink>
    );

  let body;
  if (error) {
    body = <Alert severity="error">{error}</Alert>;
  } else if (!loaded) {
    body = <Typography color="text.secondary">Loading Atlas…</Typography>;
  } else if (route.kind === "cabinet") {
    body = (
      <Cabinet
        entries={loaded.entries}
        userKey={loaded.userKey}
        entryHref={(id) => atlasEntryHref(subjectId, id)}
        onOpenEntry={(id) => navigate(atlasEntryHref(subjectId, id))}
      />
    );
  } else if (route.kind === "entry") {
    const entry = loaded.entries.find((e) => e.id === route.key);
    body = entry ? (
      <Notice title={entry.canonicalName} italic />
    ) : (
      <Notice
        title="This parasite is not in the Atlas"
        message="Check the link, or pick a parasite from the cabinet."
      />
    );
  } else {
    body = <Notice title="Compare" />;
  }

  return (
    <Box
      sx={{
        maxWidth: 1240,
        mx: "auto",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 4 },
      }}
    >
      <Box sx={{ mb: 1 }}>{crumb}</Box>
      {body}
    </Box>
  );
}
