import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The documents in a pack, without the folders that group them.
 *
 * A compendium's folders are documents in the same directory, keyed !folders!
 * rather than !items! or !actors!, and they carry no `system` at all. A check
 * that reads every file in a pack and reaches for `document.system` therefore
 * stops dead the first time a pack gains a folder — which is what happened to
 * the casting check the day the packs were grouped by book.
 *
 * @param {string} root  The repository root.
 * @param {string} pack  The pack directory under src/packs.
 * @returns {object[]} Every document in the pack, folders excluded.
 */
export function packDocuments(root, pack) {
  const directory = join(root, "src", "packs", pack);
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      ...JSON.parse(readFileSync(join(directory, file), "utf8"))
    }))
    .filter((document) => !document._key?.startsWith("!folders!"));
}
