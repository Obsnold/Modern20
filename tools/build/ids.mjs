/**
 * Stable Foundry document IDs.
 *
 * An ID is derived from a key that names the document's place in the SRD
 * (its page path, plus a suffix when one page yields several documents), so a
 * rebuild gives every document the same ID it had before. Links between
 * documents, and anything a world has dragged out of a compendium, keep working.
 */
import { createHash } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A 16-character Foundry ID for `key`. */
export function stableId(key) {
  const bytes = createHash("sha256").update(`modern20:${key}`).digest();
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
