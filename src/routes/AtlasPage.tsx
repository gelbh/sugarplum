import {
  useCallback,
  useEffect,
  useMemo,
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
} from "../atlas";
import {
  apiAtlasSource,
  listAtlasEntries,
  packHiddenIds as computePackHiddenIds,
  packIsActive,
  resetEntry,
  resetEntryFields,
  useShowHiddenPref,
} from "../atlas";
import "../atlas/hub/atlasMotion.css";
import { Cabinet } from "../atlas";
import { CompareView } from "../atlas";
import { CoursePackPanel } from "../atlas";
import { EntryView } from "../atlas";
import { entryTitles } from "../atlas";
import { MakeCardsDeckDialog } from "../atlas";
import {
  atlasCompareHref,
  atlasEntryHref,
  atlasHref,
  type AtlasRoute,
} from "../atlas";
import type {
  AtlasEntryView,
  AtlasSource,
  EditSectionId,
  FieldKey,
} from "../atlas";
import { isGuest } from "../guest/session";
import { isPlainClick, navigate, navigateReplace } from "../shared/nav/navigate";
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
  /** Server was still refreshing Focus after polling; pack hiding stays off. */
  focusRefreshPending: boolean;
};

type LoadedEntries = Pick<Loaded, "entries" | "focusRefreshPending">;

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
      <Typography
        sx={{
          color: "text.secondary",
          mt: 1
        }}>
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
  // Glance Reset failures stay inline so the Atlas itself keeps rendering.
  const [resetError, setResetError] = useState<string | null>(null);
  /** `${entryId}:${field}` keys with a Reset request in flight. */
  const [resetting, setResetting] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    entry: AtlasEntryView;
    section?: EditSectionId;
  } | null>(null);
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
  const [showHidden, setShowHidden] = useShowHiddenPref(loaded?.userKey ?? "");
  const packActive = loaded
    ? packIsActive(loaded.entries, loaded.focusRefreshPending)
    : false;
  const packHiddenIds = useMemo(
    () => computePackHiddenIds(loaded?.entries ?? [], packActive),
    [loaded?.entries, packActive],
  );
  // The first-load stagger runs once per page mount, not again on Back from an entry.
  const staggered = useRef(false);
  useEffect(() => {
    if (loaded && route.kind === "cabinet") staggered.current = true;
  }, [loaded, route.kind]);

  const loadApiEntries = useCallback(async (): Promise<LoadedEntries> => {
    if (source !== apiAtlasSource) {
      const entries = await source.list(atlasId);
      return { entries, focusRefreshPending: false };
    }
    let body = await listAtlasEntries(atlasId);
    // Background Focus extract (PDF) may take several seconds; poll a few times.
    for (let i = 0; i < 6 && body.focusRefreshPending; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      body = await listAtlasEntries(atlasId);
    }
    return {
      entries: body.entries,
      focusRefreshPending: body.focusRefreshPending ?? false,
    };
  }, [source, atlasId]);

  const reloadEntries = useCallback(async () => {
    const next = await loadApiEntries();
    setLoaded((prev) => (prev ? { ...prev, ...next } : prev));
  }, [loadApiEntries]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await loadApiEntries();
        if (cancelled) return;
        setLoaded({
          ...next,
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
  }, [loadApiEntries, user]);

  const routeEntryKey = route.kind === "entry" ? route.key : null;
  useEffect(() => {
    setResetError(null);
  }, [routeEntryKey]);

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

  async function onResetField(entry: AtlasEntryView, field: FieldKey) {
    const key = `${entry.id}:${field}`;
    const toggle = (on: boolean) =>
      setResetting((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });
    setResetError(null);
    toggle(true);
    try {
      try {
        await resetEntryFields(atlasId, entry.id, [field]);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setResetError(
          err instanceof ApiError ? err.message : "Could not reset the field",
        );
        return;
      }
      try {
        await reloadEntries();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setResetError(
          "Field reset, but the Atlas could not refresh. Reload to see it.",
        );
      }
    } finally {
      toggle(false);
    }
  }

  function onFocusUpdated(next: AtlasEntryView) {
    setLoaded((prev) =>
      prev
        ? {
            ...prev,
            entries: prev.entries.map((e) => (e.id === next.id ? next : e)),
          }
        : prev,
    );
    // Refetch so sibling rows from an older scan are replaced after a pin.
    void reloadEntries();
  }

  let body;
  if (error) {
    body = <Alert severity="error">{error}</Alert>;
  } else if (!loaded) {
    body = <Typography sx={{
      color: "text.secondary"
    }}>Loading Atlas…</Typography>;
  } else if (route.kind === "cabinet") {
    body = (
      <>
        {canMutate ? (
          <CoursePackPanel
            atlasId={atlasId}
            onFocusChanged={() => {
              void reloadEntries();
            }}
            packSummary={
              packActive
                ? {
                    shown: loaded.entries.length - packHiddenIds.size,
                    total: loaded.entries.length,
                  }
                : null
            }
          />
        ) : null}
        <Cabinet
          entries={loaded.entries}
          userKey={loaded.userKey}
          entryHref={(id) => atlasEntryHref(atlasId, id)}
          onOpenEntry={(id) => navigate(atlasEntryHref(atlasId, id))}
          onCompare={(a, b) => navigate(atlasCompareHref(atlasId, a, b))}
          stagger={!staggered.current}
          packHiddenIds={packHiddenIds}
          showHidden={showHidden}
          onShowHiddenChange={setShowHidden}
          onAddEntry={canMutate ? () => setAddOpen(true) : undefined}
          onRecentlyDeleted={canMutate ? () => setDeletedOpen(true) : undefined}
          onEditEntry={canMutate ? (entry) => setEditTarget({ entry }) : undefined}
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
          atlasId={canMutate ? atlasId : undefined}
          onFocusUpdated={canMutate ? onFocusUpdated : undefined}
        />
      </>
    );
  } else if (route.kind === "entry") {
    const entry =
      loaded.entries.find((e) => e.id === route.key) ??
      loaded.entries.find((e) => e.originKey === route.key) ??
      null;
    const resettingFields = new Set<FieldKey>();
    for (const k of resetting) {
      if (entry && k.startsWith(`${entry.id}:`))
        resettingFields.add(k.slice(entry.id.length + 1) as FieldKey);
    }
    body = entry ? (
      <EntryView
        entry={entry}
        entries={loaded.entries}
        entryHref={(id) => atlasEntryHref(atlasId, id)}
        onOpen={(id) => navigate(atlasEntryHref(atlasId, id))}
        onStep={(id) => navigateReplace(atlasEntryHref(atlasId, id))}
        packHiddenIds={packHiddenIds}
        showHidden={showHidden}
        onEdit={
          canMutate ? (section) => setEditTarget({ entry, section }) : undefined
        }
        onResetField={
          canMutate && entry.originKey
            ? (field) => void onResetField(entry, field)
            : undefined
        }
        resettingFields={resettingFields}
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
        onFocusUpdated={canMutate ? onFocusUpdated : undefined}
        atlasId={canMutate ? atlasId : undefined}
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
        packHiddenIds={packHiddenIds}
        showHidden={showHidden}
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
      {resetError && route.kind === "entry" && !error ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setResetError(null)}
        >
          {resetError}
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
            open={editTarget !== null}
            atlasId={atlasId}
            entry={editTarget?.entry ?? null}
            initialSection={editTarget?.section}
            onClose={() => setEditTarget(null)}
            onDone={() => {
              void reloadEntries();
            }}
            onEditLifecycle={() => {
              const target = editTarget;
              setEditTarget(null);
              if (target) setEditLifecycle(target.entry);
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
