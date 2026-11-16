import { useMemo, useState } from "react";
import { groupRegionsByFamily } from "./regionDisplay";
import type { AnatomyRegion, AnatomyStructure } from "./types";

type Args = {
  structures: AnatomyStructure[];
  regions?: AnatomyRegion[];
  activeRegions: Set<string>;
  maskNames?: boolean;
};

export function useStructurePanelFilter({
  structures,
  regions,
  activeRegions,
  maskNames = false,
}: Args) {
  const [q, setQ] = useState("");

  const visibleStructures = useMemo(() => {
    if (!regions?.length) return structures;
    return structures.filter(
      (s) => s.region != null && activeRegions.has(s.region),
    );
  }, [structures, regions, activeRegions]);

  const filtered = useMemo(() => {
    // Searching by label would leak answers while names are masked.
    if (maskNames) return visibleStructures;
    const needle = q.trim().toLowerCase();
    if (!needle) return visibleStructures;
    return visibleStructures.filter((s) =>
      s.label.toLowerCase().includes(needle),
    );
  }, [visibleStructures, q, maskNames]);

  const regionGroups = useMemo(() => {
    if (!regions?.length) return [];
    return groupRegionsByFamily(regions);
  }, [regions]);

  const structureGroups = useMemo(() => {
    if (!regions?.length) {
      return filtered.length
        ? [
            {
              regionId: null as string | null,
              label: null as string | null,
              items: filtered,
            },
          ]
        : [];
    }
    const byRegion = new Map<string, AnatomyStructure[]>();
    for (const s of filtered) {
      const key = s.region ?? "__none";
      const list = byRegion.get(key) ?? [];
      list.push(s);
      byRegion.set(key, list);
    }
    const groups: {
      regionId: string | null;
      label: string | null;
      items: AnatomyStructure[];
    }[] = [];
    for (const r of regions) {
      const items = byRegion.get(r.id);
      if (!items?.length) continue;
      groups.push({ regionId: r.id, label: r.label, items });
    }
    const orphan = byRegion.get("__none");
    if (orphan?.length) {
      groups.push({ regionId: null, label: "Other", items: orphan });
    }
    return groups;
  }, [filtered, regions]);

  return {
    q,
    setQ,
    visibleStructures,
    filtered,
    regionGroups,
    structureGroups,
  };
}
