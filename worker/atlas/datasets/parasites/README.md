# Built-in Parasite Dataset

This folder holds the parasite entries that every new Parasitology Atlas starts from. Each JSON file covers one group or sub-group. `index.ts` concatenates them and holds `PARASITE_DATASET_VERSION`. Nothing in the Worker imports this folder yet; seeding arrives with migration 0024.

## Coverage

The list of taxa is fixed in `tests/eval/atlas/course-taxa.json`: every taxon in the species tables of one veterinary parasitology course pack, plus 29 arthropods. The manifest stores names, lecture codes and page numbers only. A test fails when an authored file is missing any taxon the manifest assigns to it.

| File                               | Taxa | Status   |
| ---------------------------------- | ---- | -------- |
| `trematodes.json`                  | 10   | authored |
| `cestodes.json`                    | 13   | authored |
| `protozoa.json`                    | 18   | authored |
| `nematodes-ruminant.json`          | 16   | authored |
| `nematodes-equine-pig.json`        | 19   | authored |
| `nematodes-companion-poultry.json` | 23   | planned  |
| `arthropods.json`                  | 29   | authored |

## Sources

Every entry cites at least one open reference that returned HTTP 200 when the entry was written. References are used in this order:

1. WCVM Learn About Parasites
2. CDC DPDx
3. Open-access papers (PMC, Parasites & Vectors, MDPI)
4. MSD Veterinary Manual, for facts only
5. NCBI Taxonomy, to settle taxonomy
6. WikiVet and Wikipedia, only as pointers to the sources above

Phylum, order and family follow the course when a cited reference supports the course value. Otherwise they follow NCBI Taxonomy, and a ref `note` records the course value.

## Writing Rules

- Write every value in your own words. Do not copy sentences from slides, guidelines, manuals or textbooks.
- Leave a field `null` or `[]` when no cited reference supports it.
- Use a ref `note` only for a difference between the course and the references, for example "Course states 21 days; reference gives 14 to 21 days."
- Host lists and `majorOrgan` must use terms from `../vocab.ts`. Add a new term with its broader terms when none fits.
- Give every lifecycle stage a `hostRole`: `definitive`, `intermediate` or `paratenic` when the stage lives in a host from that list, `environment` when it is free in soil, water, pasture or faeces. Set `host` only when a role holds several hosts in sequence (snail, then fish), and use a term from that role's list or a narrower one.
- Set a stage's `durationDays` only when a cited reference states how long that one stage lasts, and add a `lifecycleStages` ref for it. Leave it empty for spans that cover several stages ("4 to 7 weeks from egg to metacercaria") and for time to adulthood, which `pppDays` already covers.
- Set `majorOrgan` to the site of the adult or sexual stage in a vertebrate definitive host, for example the small intestine for _Echinococcus granulosus_ and _Toxoplasma gondii_. When no vertebrate is a definitive host, use the main site in the vertebrate host instead. For a parasite with one host, use its main site in that host.
- An arthropod vector that carries stages of the parasite is a host. It is the definitive host when a cited reference places sexual reproduction or sporogony in it (ticks for _Babesia_), and the vertebrate is then an intermediate host. When no cited reference places a sexual stage in the vector (_Leishmania_, _Trypanosoma_), the vertebrate is the definitive host and the vector is an intermediate host. A vector that only carries the parasite mechanically, or a helminth that carries it in its eggs (_Heterakis gallinarum_ for _Histomonas meleagridis_), appears in `vectorRole` and in no host list.
- For an arthropod entry, list the vertebrates it lives or feeds on in `definitiveHosts`. Stages on the host get `definitive` and stages off it get `environment`. A tick's egg is `environment` and its larva, nymph and adult are `definitive`. A flea's egg, larva and pupa are `environment`. Lice and the mites that live on the host (every arthropod here except _Dermanyssus gallinae_, whose eggs and larvae stay in the housing) spend every stage on the host. Bot and blowfly larvae are `definitive`, as are eggs laid on the host's hair, fleece or wounds. Biting flies are `definitive` only as feeding adults. Use `vectorRole` for the pathogens the arthropod transmits, framed the way the pathogen's own entry frames the arthropod. _Linguatula serrata_ has a two-host cycle and uses `definitiveHosts` and `intermediateHosts` like a helminth.
- Record a slide misspelling in `misspellings` only if `normalizeParasiteName` maps it to the canonical name. Otherwise add the fix to `worker/atlas/names.ts` first, with a test.

## Adding an Entry

1. Add the taxon to `tests/eval/atlas/course-taxa.json` with its dataset file.
2. Add the entry to that file. Its `key` must be the canonical name in lower case, with dots removed and spaces turned into hyphens.
3. Run `npx vitest run tests/worker/atlas` and `npx tsc -b`.
