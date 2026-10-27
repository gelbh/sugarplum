import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const logoPath = join(publicDir, "logo.png");

const PLUM = { r: 0x5b, g: 0x2c, b: 0x6f, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function resizeLogo(size) {
  return sharp(logoPath)
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
}

async function writePaddedAny(size, outName) {
  const pad = Math.round(size * 0.1);
  const inner = size - pad * 2;
  const logo = await resizeLogo(inner);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(join(publicDir, outName));
}

async function writeOpaqueSafe(size, outName, safeFraction) {
  const safe = Math.round(size * safeFraction);
  const logo = await resizeLogo(safe);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: PLUM,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(join(publicDir, outName));
}

await writePaddedAny(192, "icon-192.png");
await writePaddedAny(512, "icon-512.png");
await writeOpaqueSafe(512, "maskable-icon-512.png", 0.8);
await writeOpaqueSafe(180, "apple-touch-icon.png", 0.8);
await writePaddedAny(32, "favicon-32.png");

console.log(
  "Wrote icon-192.png, icon-512.png, maskable-icon-512.png, apple-touch-icon.png, favicon-32.png",
);
