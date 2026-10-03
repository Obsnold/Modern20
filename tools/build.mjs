/**
 * Build the compendium packs from the markdown SRD.
 *
 *     npm run build                    # read the srd/ submodule
 *     MODERN20_SRD=../d20modernsrd npm run build   # read another checkout
 *
 * Each importer returns documents and problems. Any problem (a page that breaks
 * its layout, a link that leads nowhere, an unresolved duplicate) is printed as
 * `file:line: message` and the build stops before writing anything, so a pack
 * is only ever built from markdown that passes every check.
 *
 * Documents are written as one JSON file each under build/src/<pack>/, then
 * compiled with the Foundry CLI into packs/<pack>/ (LevelDB, what Foundry reads).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { SRD_ROOT } from "./srd/reader.mjs";
import { PACKS } from "./build/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const results = {};
let problems = 0;
for (const [pack, build] of Object.entries(PACKS)) {
  const r = build();
  results[pack] = r;
  for (const p of r.problems) console.log(`${p.path}:${p.line ?? 1}: ${p.message}`);
  problems += r.problems.length;
}
if (problems) {
  console.log(`\n${problems} problem(s) in ${SRD_ROOT}; nothing was written.`);
  process.exit(1);
}

for (const [pack, r] of Object.entries(results)) {
  const src = join(ROOT, "build", "src", pack);
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  for (const doc of r.documents) writeFileSync(join(src, `${doc._id}.json`), JSON.stringify(doc, null, 2) + "\n");
  const dest = join(ROOT, "packs", pack);
  rmSync(dest, { recursive: true, force: true });
  await compilePack(src, dest, { log: false });
  const kinds = r.documents.reduce((n, d) => (d._key.startsWith("!folders!") ? n : n + 1), 0);
  console.log(`${pack}: ${kinds} documents` + (r.skipped?.length ? ` (${r.skipped.length} skipped: ${r.skipped.join("; ")})` : ""));
}
