import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { meshopt, quantize } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

/** @param {string[]} argv */
export function meshoptEnabledFromArgv(argv) {
  return !argv.includes("--no-meshopt");
}

/** @param {string} absPath */
export async function compressGlbFile(absPath) {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });
  const doc = await io.read(absPath);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await doc.transform(
    quantize({ quantizePosition: 14 }),
    meshopt({ encoder: MeshoptEncoder }),
  );
  await io.write(absPath, doc);
}
