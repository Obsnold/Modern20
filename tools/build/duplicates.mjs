/**
 * Entries printed in more than one book under the same name.
 *
 * Each pack lists how its duplicates are resolved: `{ keep: "<Book>" }` puts
 * only that book's copy in the pack, and `"suffix"` keeps every copy, named
 * "<Name> (<Book>)". A duplicate the pack does not list is a build error, so a
 * new one in the SRD is decided on rather than silently overwriting another.
 */

/** The short book name used in a suffix: "Wild Talent (Arcana)". */
const SHORT = { Modern: "Modern", Arcana: "Arcana", Future: "Future", Menaces: "Menace" };

/**
 * Pick the entries that go in the pack.
 *
 * `entries` are `{ name, path, book }` objects. Returns `{ chosen, problems,
 * skipped }`, with `chosen` sorted by (possibly suffixed) name.
 */
export function resolveDuplicates(entries, rules, where) {
  const byName = new Map();
  for (const e of entries) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(e);
  }
  const chosen = [], problems = [], skipped = [];
  for (const [name, copies] of byName) {
    if (copies.length === 1) { chosen.push(copies[0]); continue; }
    const rule = rules[name];
    if (rule === "suffix") {
      for (const c of copies) chosen.push({ ...c, name: `${name} (${SHORT[c.book] ?? c.book})` });
    } else if (rule?.keep && copies.some((c) => c.book === rule.keep)) {
      const keep = copies.find((c) => c.book === rule.keep);
      chosen.push(keep);
      skipped.push(...copies.filter((c) => c !== keep).map((c) => `${c.path} (duplicate of ${keep.path})`));
    } else {
      problems.push({ path: copies[0].path, line: 1, message: `"${name}" is printed in ${copies.map((c) => c.path).join(" and ")}; add it to DUPLICATES in ${where}` });
    }
  }
  chosen.sort((a, b) => a.name.localeCompare(b.name));
  return { chosen, problems, skipped };
}
