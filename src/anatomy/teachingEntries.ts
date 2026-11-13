import { anatomySceneHref } from "./paths";

/** Curated hub deep-links into existing VT regions (no new meshes). */
export type AnatomyTeachingEntry = {
  id: string;
  title: string;
  blurb: string;
  sceneId: string;
  regions: string[];
};

export const ANATOMY_TEACHING_ENTRIES: AnatomyTeachingEntry[] = [
  {
    id: "canine-limbs",
    title: "Canine · Limbs",
    blurb: "All four limb regions on the canine mega-scene",
    sceneId: "canine",
    regions: [
      "legs-left-back",
      "legs-left-front",
      "legs-right-back",
      "legs-right-front",
    ],
  },
  {
    id: "canine-skull",
    title: "Canine · Skull",
    blurb: "Skull region on the canine mega-scene",
    sceneId: "canine",
    regions: ["skull"],
  },
  {
    id: "equine-muscles",
    title: "Equine · Muscles",
    blurb: "Whole-body + cranial muscle regions",
    sceneId: "equine",
    regions: ["muscles", "muscles-cranial-muscles"],
  },
  {
    id: "equine-nerves",
    title: "Equine · Nerves",
    blurb: "Cranial and right-front leg nerve regions",
    sceneId: "equine",
    regions: [
      "nervous-system-cranial-nerves",
      "nervous-system-leg-nerves-right-front",
    ],
  },
  {
    id: "bovine-limbs",
    title: "Bovine · Limbs",
    blurb: "Front and back limb regions",
    sceneId: "bovine",
    regions: ["back-legs", "front-legs"],
  },
  {
    id: "bovine-skull-ribs",
    title: "Bovine · Skull & ribs",
    blurb: "Skull/cervical and ribs/spine regions",
    sceneId: "bovine",
    regions: ["skull-cervical", "ribs-spine"],
  },
];

export function teachingEntryHref(entry: AnatomyTeachingEntry): string {
  return anatomySceneHref(entry.sceneId, { regions: entry.regions });
}
