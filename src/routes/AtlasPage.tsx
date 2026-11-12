import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { ApiError } from "../api/client";
import {
  AddEntryDialog,
  EditEntryDialog,
  EditLifecycleDialog,
  RecentlyDeletedDialog,
} from "../atlas/AtlasMutateDialogs";
import { apiAtlasSource, resetEntry } from "../atlas/apiSource";
import "../atlas/atlasMotion.css";
import Cabinet from "../atlas/Cabinet";
import CompareView from "../atlas/CompareView";
import EntryView from "../atlas/EntryView";
import { entryTitles } from "../atlas/entryTitles";
import MakeCardsDeckDialog from "../atlas/MakeCardsDeckDialog";
import {
  atlasCompareHref,
  atlasEntryHref,
  atlasHref,
  type AtlasRoute,
} from "../atlas/paths";
import type { AtlasEntryView, AtlasSource } from "../atlas/types";
import { isGuest } from "../guest/session";
import { isPlainClick, navigate, navigateReplace } from "../nav/navigate";
import { useSession } from "../session/SessionContext";

function entryMakeCardsKey(entry: AtlasEntryView): string {
  return entry.originKey ?? entry.id;
}

type Props = {
  atlasId: string;
  route: AtlasRoute;
  source?: AtlasSource;
};

type Loaded = {
  entries: AtlasEntryView[];
  userKey: string;
};

function NavLink({ href, children }: { href: string; children: string }) {
  const onClick = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(ev)) return;
    ev.preventDefault();
    navigate(href);
  };
  return (
    <Link href={href} underline="hover" onClick={onClick}>
      {children}
    </Link>
  );
}

// TODO(tomer): replace with the entry view when it ships.
const STILL_BUILDING =
  "This view is still being built. The cabinet has the hosts, site and PPP for now.";

function Notice({
  title,
  message = STILL_BUILDING,
  italic,
  children,
}: {
  title: string;
  message?: string;
  italic?: boolean;
  children?: ReactNode;
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
      {children}
    </Paper>
  );
}

export default function AtlasPage({
  atlasId,
  route,
  source = apiAtlasSource,
}: Props) {
  const { user } = useSession();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<AtlasEntryView | null>(null);
  const [editLifecycle, setEditLifecycle] = useState<AtlasEntryView | null>(
    null,
  );
  const [makeCardsDialog, setMakeCardsDialog] = useState<{
    keys: string[];
    title: string;
  } | null>(null);
  const [queueNotice, setQueueNotice] = useState<{
    jobId: string;
    jobCount: number;
  } | null>(null);
  // The first-load stagger runs once per page mount, not again on Back from an entry.
  const staggered = useRef(false);
  useEffect(() => {
    if (loaded && route.kind === "cabinet") staggered.current = true;
  }, [loaded, route.kind]);

  const reloadEntries = useCallback(async () => {
    const entries = await source.list(atlasId);
    setLoaded((prev) => (prev ? { ...prev, entries } : prev));
  }, [source, atlasId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await source.list(atlasId);
        if (cancelled) return;
        setLoaded({
          entries,
          userKey: isGuest() ? "guest" : user.id,
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
  }, [source, atlasId, user]);

  const home = atlasHref(atlasId);
  const crumb =
    route.kind === "cabinet" ? null : (
      <NavLink href={home}>Parasitology Atlas</NavLink>
    );

  const canMutate = !isGuest();

  async function onResetEntry(entry: AtlasEntryView) {
    if (!entry.originKey || !entry.editedAt) return;
    if (!window.confirm(`Reset ${entryTitles(entry).primary} to the dataset?`))
      return;
    try {
      await resetEntry(atlasId, entry.id);
      await reloadEntries();
      if (route.kind === "entry") {
        navigateReplace(atlasEntryHref(atlasId, entry.originKey));
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reset entry",
      );
    }
  }

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
        entryHref={(id) => atlasEntryHref(atlasId, id)}
        onOpenEntry={(id) => navigate(atlasEntryHref(atlasId, id))}
        onCompare={(a, b) => navigate(atlasCompareHref(atlasId, a, b))}
        stagger={!staggered.current}
        onAddEntry={canMutate ? () => setAddOpen(true) : undefined}
        onRecentlyDeleted={canMutate ? () => setDeletedOpen(true) : undefined}
        onEditEntry={canMutate ? (entry) => setEditEntry(entry) : undefined}
        onMakeCardsFromKey={
          canMutate
            ? (keys) => {
                if (keys.length === 0) return;
                setMakeCardsDialog({
                  keys,
                  title: "Make cards from Key",
                });
              }
            : undefined
        }
      />
    );
  } else if (route.kind === "entry") {
    const entry =
      loaded.entries.find((e) => e.id === route.key) ??
      loaded.entries.find((e) => e.originKey === route.key) ??
      null;
    body = entry ? (
      <EntryView
        entry={entry}
        entries={loaded.entries}
        entryHref={(id) => atlasEntryHref(atlasId, id)}
        onOpen={(id) => navigate(atlasEntryHref(atlasId, id))}
        onStep={(id) => navigateReplace(atlasEntryHref(atlasId, id))}
        onEdit={canMutate ? () => setEditEntry(entry) : undefined}
        onEditLifecycle={
          canMutate ? () => setEditLifecycle(entry) : undefined
        }
        onReset={
          canMutate && entry.originKey && entry.editedAt
            ? () => void onResetEntry(entry)
            : undefined
        }
        onMakeCards={
          canMutate
            ? () => {
                setMakeCardsDialog({
                  keys: [entryMakeCardsKey(entry)],
                  title: `Make cards · ${entryTitles(entry).primary}`,
                });
              }
            : undefined
        }
      />
    ) : (
      <Notice
        title="This parasite is not in the Atlas"
        message="Check the link, or pick a parasite from the cabinet."
      >
        <Box sx={{ mt: 1.5 }}>
          <NavLink href={home}>Back to the Parasitology Atlas</NavLink>
        </Box>
      </Notice>
    );
  } else {
    body = (
      <CompareView
        entries={loaded.entries}
        a={route.a}
        b={route.b}
        entryHref={(id) => atlasEntryHref(atlasId, id)}
        onOpenEntry={(id) => navigate(atlasEntryHref(atlasId, id))}
        onChange={(a, b) => navigateReplace(atlasCompareHref(atlasId, a, b))}
      />
    );
  }

  return (
    <Box
      sx={{
        maxWidth: route.kind === "entry" ? 1480 : 1240,
        mx: "auto",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 4 },
      }}
    >
      {crumb ? <Box sx={{ mb: 1 }}>{crumb}</Box> : null}
      {queueNotice ? (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setQueueNotice(null)}
        >
          {queueNotice.jobCount > 1
            ? `${queueNotice.jobCount} jobs queued (opening the first). `
            : "Cards queued. "}
          <Link href={`/jobs/${queueNotice.jobId}/drafts`} underline="hover">
            Open Draft Review
          </Link>
        </Alert>
      ) : null}
      {body}
      {canMutate ? (
        <>
          <AddEntryDialog
            open={addOpen}
            atlasId={atlasId}
            onClose={() => setAddOpen(false)}
            onDone={(entry) => {
              void reloadEntries().then(() =>
                navigate(atlasEntryHref(atlasId, entry.id)),
              );
            }}
          />
          <EditEntryDialog
            open={editEntry !== null}
            atlasId={atlasId}
            entry={editEntry}
            onClose={() => setEditEntry(null)}
            onDone={() => {
              void reloadEntries();
            }}
          />
          <EditLifecycleDialog
            open={editLifecycle !== null}
            atlasId={atlasId}
            entry={editLifecycle}
            onClose={() => setEditLifecycle(null)}
            onDone={() => {
              void reloadEntries();
            }}
          />
          <RecentlyDeletedDialog
            open={deletedOpen}
            atlasId={atlasId}
            onClose={() => setDeletedOpen(false)}
            onChanged={() => {
              void reloadEntries();
            }}
          />
          <MakeCardsDeckDialog
            open={makeCardsDialog !== null}
            atlasId={atlasId}
            entryKeys={makeCardsDialog?.keys ?? []}
            title={makeCardsDialog?.title}
            onClose={() => setMakeCardsDialog(null)}
            onQueued={(jobId, jobCount) => {
              setQueueNotice({ jobId, jobCount });
            }}
          />
        </>
      ) : null}
    </Box>
  );
}
