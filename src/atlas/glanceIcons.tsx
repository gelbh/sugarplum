import type { ReactElement } from "react";
import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";
import type { GlanceKey, GlanceRow } from "./entryGlance";

type Icon = (props: SvgIconProps) => ReactElement;

function glyph(
  d: string | string[],
  displayName: string,
): Icon {
  const paths = Array.isArray(d) ? d : [d];
  function Icon(props: SvgIconProps) {
    return (
      <SvgIcon viewBox="0 0 24 24" {...props}>
        {paths.map((p) => (
          <path key={p.slice(0, 24)} d={p} />
        ))}
      </SvgIcon>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

/** Stylized leaf-shaped fluke / flatworm. */
const Flatworm = glyph(
  "M4 12c2.5-5 6-8 8-8s5.5 3 8 8c-2.5 5-6 8-8 8s-5.5-3-8-8zm8-5.2c.7 1.6.7 8.8 0 10.4C10.6 15.6 9 13.5 9 12s1.6-3.6 3-5.2zm0 0c1.4 1.6 3 3.5 3 5.2s-1.6 3.6-3 5.2",
  "FlatwormIcon",
);

/** Roundworm / nematode: coiled body (not a letterform). */
const Roundworm = glyph(
  [
    "M6.2 8.2c0-2.1 1.9-3.8 4.3-3.8 2.1 0 3.5 1.1 5.1 2.6 1.3 1.3 2.8 2.2 4.6 2.2v2.15c-2.5 0-4.4-1.2-5.9-2.7-1.4-1.4-2.6-2.4-3.8-2.4-1.1 0-2 .8-2 1.9 0 2.4 2.3 3.3 4.6 4.2 2.5.9 5.1 1.9 5.1 4.5 0 2.5-2.2 4.4-5.4 4.4-2.9 0-5-1.5-6.1-3.4l1.75-1.2c.8 1.3 2.2 2.3 4.35 2.3 1.9 0 3.15-1.05 3.15-2.15 0-1.5-1.7-2.2-4-3.05C7.9 12.6 5 11.3 5 8.2h1.2z",
    "M17.8 5.4c-.9-1-2.2-1.7-3.7-1.9v1.9c.9.15 1.7.55 2.35 1.15l1.35-1.15z",
  ],
  "RoundwormIcon",
);

/** Tapeworm / proglottid chain. */
const Tapeworm = glyph(
  "M5 11h2.2v2H5v-2zm3.2-1.2h2.4v4.4H8.2V9.8zm3.4-1h2.4v6.4h-2.4V8.8zm3.4-.8h2.2v8h-2.2v-8zm3.2.6h2.2v6.8H18.2V8.6zM4 12.2c0-1.4.7-2.6 1.8-3.3L4.6 7.4C2.8 8.5 1.8 10.2 1.8 12.2c0 2 .9 3.6 2.6 4.7l1.2-1.5C4.7 14.8 4 13.6 4 12.2zm18.2 0c0-2-.9-3.7-2.8-4.8l-1.2 1.5c1.1.7 1.8 1.9 1.8 3.3s-.7 2.6-1.8 3.3l1.2 1.5c1.9-1.1 2.8-2.8 2.8-4.8z",
  "TapewormIcon",
);

/** Amoeba / protozoan blob. */
const Protozoan = glyph(
  "M12 3.5c2.2 0 3.6 1.1 4.4 2.2.9-.2 1.9.1 2.6.9 1.2 1.3 1.1 3.2.3 4.4.7.9 1 2.1.5 3.2-.5 1.2-1.7 1.9-3 1.9-.3 1.4-1.4 2.7-3.1 3.1-1.5.4-3-.2-3.9-1.4-1 .7-2.4.7-3.4-.2-1.2-1.1-1.3-2.9-.4-4.1C5.2 12.5 4.8 11 5.4 9.7c.6-1.3 1.9-2 3.2-1.9.5-1.5 1.9-2.8 3.4-4.3z",
  "ProtozoanIcon",
);

/** Tick / mite silhouette for arthropods. */
const Arthropod = glyph(
  "M12 7.2c1.9 0 3.4 1.6 3.4 3.6 0 1.4-.7 2.6-1.8 3.2l1.2 3.8h-2.1l-.8-2.6h-.8l-.8 2.6H8.2l1.2-3.8C8.3 13.4 7.6 12.2 7.6 10.8c0-2 1.5-3.6 3.4-3.6H12zm-5.8 1.4 2.1 1.1-.7 1.4-2.4-1.2.1-1.3zm11.6 0-.1 1.3 2.4 1.2-.7-1.4-1.6-.9v-.2zM5.5 12.5h2.6v1.5H5.5v-1.5zm10.4 0h2.6v1.5h-2.6v-1.5zM7.2 15.8l2 1.6-1 1.2-2.3-1.8 1.3-1zm9.6 0-1.3 1 2.3 1.8 1-1.2-2-1.6zM12 4.8h1.5v2.2H10.5V4.8H12z",
  "ArthropodIcon",
);

const Liver = glyph(
  "M4.5 9.5c0-2.8 2.2-5 5.2-5 1.6 0 2.7.5 3.8 1.4.7-.5 1.6-.8 2.7-.8 2.6 0 4.3 1.9 4.3 4.4 0 4.8-3.6 9-8.2 10.3C7.4 18.4 4.5 14.6 4.5 9.5zm7.2 1.2v6.2c2.6-.9 4.6-3.5 5.3-6.4-.5-.2-1.1-.3-1.7-.3-1.2 0-2.2.4-3.6.5z",
  "LiverIcon",
);

const Lungs = glyph(
  "M10.2 5.5c-2.4 0-4.4 2.2-4.4 5.2v5.6c0 1.5 1.1 2.7 2.5 2.7 1.2 0 2.2-.9 2.4-2.1V9.8h.6v6.9c.2 1.3 1.2 2.3 2.5 2.3 1.4 0 2.5-1.2 2.5-2.7V10.7c0-3-2-5.2-4.4-5.2-.7 0-1.3.2-1.8.5-.5-.3-1.1-.5-1.9-.5z",
  "LungsIcon",
);

const Gut = glyph(
  "M7 5.5h10v2.2H9.2v2.4h6.6v2.2H9.2v2.4H17V17H7V5.5zm1.8 12.2h6.4c0 1.6-1.4 2.8-3.2 2.8s-3.2-1.2-3.2-2.8z",
  "GutIcon",
);

const Brain = glyph(
  "M12 4.2c-2.2 0-3.8 1.3-4.4 2.9C6.2 7.3 5 8.7 5 10.5c0 1.2.5 2.2 1.3 2.9-.2.4-.3.9-.3 1.4 0 1.7 1.2 3 2.8 3.3.4 1.2 1.5 2.1 2.9 2.1s2.5-.9 2.9-2.1c1.6-.3 2.8-1.6 2.8-3.3 0-.5-.1-1-.3-1.4.8-.7 1.3-1.7 1.3-2.9 0-1.8-1.2-3.2-2.6-3.4C15.8 5.5 14.2 4.2 12 4.2z",
  "BrainIcon",
);

const Blood = glyph(
  "M12 3.8c.4 0 6.2 6.1 6.2 10.2 0 3.3-2.8 5.8-6.2 5.8s-6.2-2.5-6.2-5.8C5.8 9.9 11.6 3.8 12 3.8z",
  "BloodIcon",
);

const Muscle = glyph(
  "M4.5 14.5c2-3.5 4.2-5.5 7.5-5.5s5.5 2 7.5 5.5c-2 3.5-4.2 5.5-7.5 5.5s-5.5-2-7.5-5.5zM8 10.2c1.1-1.4 2.4-2.2 4-2.2s2.9.8 4 2.2",
  "MuscleIcon",
);

const Skin = glyph(
  "M6 7.5h12v2.2c-1.4.6-2.4 1.9-2.4 3.5S16.6 16 18 16.6V19H6v-2.4c1.4-.6 2.4-1.9 2.4-3.4S7.4 10.3 6 9.7V7.5z",
  "SkinIcon",
);

const Eye = glyph(
  "M12 6.5C7 6.5 3.2 10.2 2 12c1.2 1.8 5 5.5 10 5.5s8.8-3.7 10-5.5c-1.2-1.8-5-5.5-10-5.5zm0 8.2A2.7 2.7 0 1 1 12 9.3a2.7 2.7 0 0 1 0 5.4z",
  "EyeIcon",
);

const Bladder = glyph(
  "M12 4.5c-2.8 0-5 2.6-5 6.2 0 2.4 1 4.3 2.4 5.5V19h5.2v-2.8c1.4-1.2 2.4-3.1 2.4-5.5 0-3.6-2.2-6.2-5-6.2z",
  "BladderIcon",
);

const Lymph = glyph(
  "M8.5 5.5h7v3.2c0 1.4-.8 2.5-2 3.1v7.7H10.5v-7.7c-1.2-.6-2-1.7-2-3.1V5.5zm1.8 1.8v1.4c0 .7.5 1.3 1.2 1.3h.2c.7 0 1.2-.6 1.2-1.3V7.3H10.3z",
  "LymphIcon",
);

const Airway = glyph(
  "M10.2 4.5h3.6v7.2c1.8.4 3.2 2 3.2 4 0 2.3-1.8 4-4.1 4h-1.8c-2.3 0-4.1-1.7-4.1-4 0-2 1.4-3.6 3.2-4V4.5zm1.4 9.2c-1.1.3-1.9 1.3-1.9 2.5 0 1.2.9 2.1 2 2.1h1.2c1.1 0 2-.9 2-2.1 0-1.2-.8-2.2-1.9-2.5h-1.4z",
  "AirwayIcon",
);

const OrganGeneric = glyph(
  "M12 4.2c-3.6 0-6.5 2.6-6.5 6.2 0 4.4 3.5 8.4 6.5 9.4 3-1 6.5-5 6.5-9.4 0-3.6-2.9-6.2-6.5-6.2z",
  "OrganGenericIcon",
);

const Egg = glyph(
  "M12 3.5c-3.2 0-6 3.8-6 8.2S8.8 20.5 12 20.5s6-4.4 6-8.8-2.8-8.2-6-8.2zm0 3.2c.8 0 1.8 1.4 1.8 3.4S12.8 13.5 12 13.5s-1.8-1.4-1.8-3.4S11.2 6.7 12 6.7z",
  "EggIcon",
);

const Cyst = glyph(
  [
    "M12 4.5c-4 0-7.2 3.2-7.2 7.2S8 18.9 12 18.9s7.2-3.2 7.2-7.2S16 4.5 12 4.5zm0 2.2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
    "M10.2 11.2c.6-.8 1.4-1.2 1.8-1.2s1.2.4 1.8 1.2c.4.5.4 1.5 0 2-.6.8-1.4 1.2-1.8 1.2s-1.2-.4-1.8-1.2c-.4-.5-.4-1.5 0-2z",
  ],
  "CystIcon",
);

const Larva = glyph(
  "M4.5 13.2c1.2-3.2 3.4-5.2 6-5.2 1.6 0 2.8.7 3.8 1.6 1-.7 2.2-1.2 3.6-1.2 1.4 0 2.6.6 3.4 1.5l-1.3 1.4c-.4-.5-1.1-.8-2.1-.8-1.1 0-2 .5-2.7 1.2l1.1 4.6H14l-.7-2.8c-.5.3-1.1.5-1.8.5-2 0-3.6-1.4-4.6-3.5-.3.9-.4 1.8-.4 2.7H4.5c0-1.2.1-2.4.5-3.5z",
  "LarvaIcon",
);

const Cercaria = glyph(
  [
    "M10.5 5.5c-2.2 0-4 1.8-4 4.2 0 2.6 1.7 4.2 4 5.1v5.7h2.2v-5.7c2.3-.9 4-2.5 4-5.1 0-2.4-1.8-4.2-4-4.2h-2.2z",
    "M11.1 20.2h2.4l1.8 2.3h-2.1l-1-1.3-1 1.3H8.9l2.2-2.3z",
  ],
  "CercariaIcon",
);

const AdultFluke = glyph(
  "M5 12c2.8-6 5.8-8.5 7-8.5s4.2 2.5 7 8.5c-2.8 6-5.8 8.5-7 8.5S7.8 18 5 12zm7-5.5c1 2.2 1 8.8 0 11-1-2.2-2.8-4.5-2.8-5.5S11 8.7 12 6.5z",
  "AdultFlukeIcon",
);

const Microfilaria = glyph(
  "M3.5 12.5c2-4 4.5-6 7-6 1.8 0 3.2 1 4.4 2.2C16.2 7.4 17.8 6.5 20 6.5v2.2c-1.6 0-2.8.7-3.8 1.7 1.1 1.3 1.8 2.9 1.8 4.6h-2.2c0-1.5-.6-2.8-1.5-3.8-1 1.2-2.3 2-3.9 2-2 0-3.9-1.4-5.4-4.2l1.9-1.1c1.1 2 2.3 2.9 3.5 2.9 1.1 0 2-.6 2.7-1.4C11.4 8.4 10.4 8 9.2 8c-1.8 0-3.5 1.4-5 4l-.7-1.5z",
  "MicrofilariaIcon",
);

const StageGeneric = glyph(
  "M12 4.2A7.8 7.8 0 1 0 12 19.8 7.8 7.8 0 0 0 12 4.2zm0 2.2a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2z",
  "StageGenericIcon",
);

const HostsHerd = glyph(
  [
    "M7.2 11.2c1.3 0 2.3-1.1 2.3-2.4S8.5 6.4 7.2 6.4 4.9 7.5 4.9 8.8s1 2.4 2.3 2.4zm0 1.2c-1.7 0-5.1.9-5.1 2.6V17h10.2v-2c0-1.7-3.4-2.6-5.1-2.6z",
    "M16.5 10.8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 1c-1.4 0-4.2.7-4.2 2.2V17H21v-3c0-1.5-2.8-2.2-4.5-2.2z",
    "M12.2 8.6c.9 0 1.6-.7 1.6-1.6S13.1 5.4 12.2 5.4s-1.6.7-1.6 1.6.7 1.6 1.6 1.6z",
  ],
  "HostsHerdIcon",
);

const HostsSnail = glyph(
  [
    "M8.5 14.5c0-3.2 2.4-5.8 5.5-5.8 2.4 0 4.4 1.5 5.2 3.6h2.1c-1-3.4-4-5.8-7.3-5.8-4.4 0-7.9 3.6-7.9 8h2.4z",
    "M13.8 10.2c-2.1 0-3.8 1.8-3.8 4h2.2c0-1 .8-1.8 1.6-1.8.7 0 1.3.5 1.5 1.2l2-.6c-.5-1.6-2-2.8-3.5-2.8z",
  ],
  "HostsSnailIcon",
);

const HostsGeneric = glyph(
  "M12 6.2c1.5 0 2.7-1.2 2.7-2.7S13.5.8 12 .8 9.3 2 9.3 3.5 10.5 6.2 12 6.2zM6.5 11c1.4 0 2.5-1.2 2.5-2.6S7.9 5.8 6.5 5.8 4 7 4 8.4 5.1 11 6.5 11zm11 0c1.4 0 2.5-1.2 2.5-2.6S18.9 5.8 17.5 5.8 15 7 15 8.4s1.1 2.6 2.5 2.6zM12 7.8c-2.4 0-7.2 1.2-7.2 3.6V15h14.4v-3.6c0-2.4-4.8-3.6-7.2-3.6z",
  "HostsGenericIcon",
);

const Calendar = glyph(
  [
    "M7 3.8h2.2v2.2H7V3.8zm7.8 0H17v2.2h-2.2V3.8zM5 6.8h14v13.4H5V6.8zm2.2 2.2v2.2h2.2V9h-2.2zm3.6 0v2.2h2.2V9h-2.2zm3.6 0v2.2H16V9h-2.2zM7.2 12.6v2.2h2.2v-2.2H7.2zm3.6 0v2.2h2.2v-2.2h-2.2zm3.6 0v2.2H16v-2.2h-2.2z",
  ],
  "CalendarIcon",
);

const GlobeBands = glyph(
  [
    "M12 3.5A8.5 8.5 0 1 0 12 20.5 8.5 8.5 0 0 0 12 3.5zm0 1.8c1.4 0 2.7.5 3.8 1.2H8.2A6.6 6.6 0 0 1 12 5.3zm-6.6 6.2c0-.7.1-1.4.3-2h12.6c.2.6.3 1.3.3 2s-.1 1.4-.3 2H5.7c-.2-.6-.3-1.3-.3-2zm1 4h11.2A6.6 6.6 0 0 1 12 18.7a6.6 6.6 0 0 1-5.6-3.2z",
  ],
  "GlobeBandsIcon",
);

const MapPin = glyph(
  "M12 3.5c-3.3 0-6 2.6-6 5.9 0 4.4 6 11.1 6 11.1s6-6.7 6-11.1c0-3.3-2.7-5.9-6-5.9zm0 8.1A2.2 2.2 0 1 1 12 7.2a2.2 2.2 0 0 1 0 4.4z",
  "MapPinIcon",
);

const PlateHazard = glyph(
  [
    "M4.5 16.5h15v2.2h-15v-2.2zm2-9.2h2.2v7.4H6.5V7.3zm3.4-1.5c2.4 0 4.4 2 4.4 4.5v4.4h-2.2v-4.4c0-1.2-1-2.3-2.2-2.3V5.8z",
    "M17.2 6.2 18.5 8l1.6-.6.4 1.7 1.6.7-1.2 1.4.6 1.6-1.7.3-.7 1.6-1.4-1.1-1.6.5.1-1.7-1.4-1.1 1.3-1.2-.4-1.7 1.7-.3.6-1.6z",
  ],
  "PlateHazardIcon",
);

const ZoonoticYes = glyph(
  [
    "M8.2 9.5c1.4 0 2.5-1.2 2.5-2.6S9.6 4.3 8.2 4.3 5.7 5.5 5.7 6.9s1.1 2.6 2.5 2.6zm0 1.2c-1.8 0-5.3.9-5.3 2.7v2.2h10.6v-2.2c0-1.8-3.5-2.7-5.3-2.7z",
    "M16.5 8.8c1.2 0 2.1-1 2.1-2.2s-.9-2.2-2.1-2.2-2.1 1-2.1 2.2.9 2.2 2.1 2.2zm0 1c-1.5 0-4.4.8-4.4 2.3v2.3H21V12c0-1.5-2.9-2.2-4.5-2.2z",
    "M11.2 15.8h1.6v4.5h-1.6zM10 18.8h4v1.5h-4z",
  ],
  "ZoonoticYesIcon",
);

const ZoonoticNo = glyph(
  "M12 3.8A8.2 8.2 0 1 0 12 20.2 8.2 8.2 0 0 0 12 3.8zm3.8 12.1L7.9 8.1l1.2-1.2 7.9 7.8-1.2 1.2z",
  "ZoonoticNoIcon",
);

const ZoonoticMaybe = glyph(
  "M12 3.8A8.2 8.2 0 1 0 12 20.2 8.2 8.2 0 0 0 12 3.8zm0 13.2a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm1.2-4.3h-2.4c0-2.2 1.6-2.5 1.6-3.6 0-.8-.5-1.2-1.3-1.2-.9 0-1.4.5-1.7 1.1l-1.9-1C8.2 6.8 9.6 5.8 11.3 5.8c2.1 0 3.7 1.2 3.7 3.1 0 2.1-1.8 2.5-1.8 3.8z",
  "ZoonoticMaybeIcon",
);

const VectorBug = glyph(
  "M12 7.5c1.7 0 3.1 1.5 3.1 3.4 0 1.3-.7 2.4-1.7 3l1.1 3.5h-2l-.7-2.4h-.6l-.7 2.4H7.5l1.1-3.5c-1-.6-1.7-1.7-1.7-3 0-1.9 1.4-3.4 3.1-3.4H12zM5.8 9.2l1.9 1-.6 1.2-2.2-1.1.9-1.1zm12.4 0-.9 1.1 2.2 1.1.6-1.2-1.9-1zM4.8 12.4h2.4v1.4H4.8v-1.4zm12 0h2.4v1.4H16.8v-1.4z",
  "VectorBugIcon",
);

const Notes = glyph(
  "M6 4.5h9.5L18.5 7.5V19.5H6V4.5zm2.2 3.2v1.8h5.2V7.7H8.2zm0 3.4v1.8h7.6v-1.8H8.2zm0 3.4v1.8h7.6v-1.8H8.2z",
  "NotesIcon",
);

const Timeline = glyph(
  "M4.5 11.2h4.2v1.6H4.5v-1.6zm5.5-3.4h4v8.4h-4V7.8zm5.5 1.8h4.2v4.8H15.5V9.6zM5.2 16.8h13.6v1.8H5.2v-1.8z",
  "TimelineIcon",
);

function organIcon(cue: string): Icon {
  const c = cue.toLowerCase();
  if (/(bile|liver)/.test(c)) return Liver;
  if (/(lung|pulmonary)/.test(c)) return Lungs;
  if (
    /(gastro|stomach|intestin|abomasum|rumen|ileum|caecum|oesophag)/.test(c)
  )
    return Gut;
  if (/(central nervous|brain)/.test(c)) return Brain;
  if (/(blood|haemolymph|lymph|marrow)/.test(c)) return Blood;
  if (/(muscle)/.test(c)) return Muscle;
  if (/(skin|ear canal)/.test(c)) return Skin;
  if (/(eye)/.test(c)) return Eye;
  if (/(urinary|bladder)/.test(c)) return Bladder;
  if (/(nasal|trachea)/.test(c)) return Airway;
  if (/(lymph|haemolymph|bone marrow)/.test(c)) return Lymph;
  return OrganGeneric;
}

function stageIcon(cue: string): Icon {
  const c = cue.toLowerCase();
  if (/(oocyst|egg)/.test(c)) return Egg;
  if (/(metacercaria|cysticer|hydatid|tissue cyst|sporocyst|encyst)/.test(c))
    return Cyst;
  if (/(cercaria)/.test(c)) return Cercaria;
  if (/(microfilaria)/.test(c)) return Microfilaria;
  if (/(adult fluke|fluke)/.test(c)) return AdultFluke;
  if (/(larva|l1|l2|l3|l4|nymph|miracid)/.test(c)) return Larva;
  if (/(adult|proglottid|tapeworm|trophozoite|amastigote|trypomastigote)/.test(c))
    return AdultFluke;
  return StageGeneric;
}

function groupIcon(cue: string): Icon {
  switch (cue) {
    case "trematode":
      return Flatworm;
    case "nematode":
      return Roundworm;
    case "cestode":
      return Tapeworm;
    case "protozoan":
      return Protozoan;
    case "arthropod":
      return Arthropod;
    default:
      return StageGeneric;
  }
}

function hostsIcon(cue: string): Icon {
  const c = cue.toLowerCase();
  if (/(snail|lymnaeid|galba|biomphalaria|oncomelania)/.test(c))
    return HostsSnail;
  if (/(human|sheep|cattle|goat|dog|cat|pig|horse|deer)/.test(c))
    return HostsHerd;
  return HostsGeneric;
}

function zoonoticIcon(cue: string): Icon {
  if (cue.includes(":food")) return PlateHazard;
  if (cue.includes(":no")) return ZoonoticNo;
  if (cue.includes(":potential")) return ZoonoticMaybe;
  return ZoonoticYes;
}

function distributionIcon(cue: string): Icon {
  if (/(world|global|continent|cosmopolitan|ubiquit)/i.test(cue))
    return GlobeBands;
  return MapPin;
}

const BY_KEY_FALLBACK: Partial<Record<GlanceKey, Icon>> = {
  taxonomy: StageGeneric,
  definitiveHosts: HostsGeneric,
  intermediateHosts: HostsGeneric,
  paratenicHosts: HostsGeneric,
  majorOrgan: OrganGeneric,
  onHostStages: Timeline,
  pppDays: Calendar,
  diagnosticStage: Egg,
  infective: Cyst,
  zoonotic: ZoonoticYes,
  distribution: GlobeBands,
  vectorRole: VectorBug,
  significance: Notes,
};

/** Resolve a content-specific glance icon from row cue + key. */
export function glanceIconFor(row: GlanceRow): Icon {
  const cue = (row.iconCue ?? "").trim();
  switch (row.key) {
    case "taxonomy":
      return cue ? groupIcon(cue) : Flatworm;
    case "majorOrgan":
      return cue ? organIcon(cue) : OrganGeneric;
    case "diagnosticStage":
    case "infective":
      return cue ? stageIcon(cue) : StageGeneric;
    case "definitiveHosts":
    case "intermediateHosts":
    case "paratenicHosts":
      return cue ? hostsIcon(cue) : HostsGeneric;
    case "zoonotic":
      return cue ? zoonoticIcon(cue) : ZoonoticYes;
    case "distribution":
      return cue ? distributionIcon(cue) : GlobeBands;
    case "pppDays":
      return Calendar;
    case "onHostStages":
      return Timeline;
    case "vectorRole":
      return VectorBug;
    case "significance":
      return Notes;
    default:
      return BY_KEY_FALLBACK[row.key] ?? StageGeneric;
  }
}
