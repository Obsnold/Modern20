/**
 * Feats: every `<Book>/Feats/<Name>.md` page as a feat item.
 *
 * The layout every feat page must follow:
 *
 *   # Feat Name                 (optionally `# Feat Name [METAMAGIC]`)
 *   intro paragraphs            (optional)
 *   ## Prerequisites            (optional)
 *   ## Benefit                  (required)
 *   ## Normal                   (optional)
 *   ## Special                  (optional)
 *
 * in that order, each at most once. Anything else is reported with its file and
 * line, and the build stops, so the markdown cannot drift from the format the
 * importer reads.
 */
import { listPages, readPage, toHtml, text } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { resolveDuplicates } from "./duplicates.mjs";
import { FEAT_EFFECTS, MODES } from "../../module/rules/effects.mjs";

const SECTIONS = ["Prerequisites", "Benefit", "Normal", "Special"];
const TYPES = { METAMAGIC: "metamagic", METAPSIONIC: "metapsionic", INITIAL: "initial" };
const ICON = "systems/modern20/assets/icons/lorc/muscle-up.svg";

/** Feats printed in more than one book; see duplicates.mjs. */
export const DUPLICATES = {
  "Alien Weapons Proficiency": { keep: "Future" },
  "Jack of All Trades": "suffix",
  "Wild Talent": "suffix",
};

/** Pages that are feats: in a Feats directory and not that directory's index page. */
export function featPages() {
  return listPages().filter((p) => /^[^/]+\/Feats\/[^/]+\.md$/.test(p) && !/\/feats\.md$/i.test(p));
}

/** Check one feat page; returns `{ feat, problems }` (feat is null when the page is unusable). */
export function readFeat(path) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });

  const h1s = page.root.children.filter((s) => s.depth === 1);
  if (h1s.length !== 1) { fail(1, `expected one # heading, found ${h1s.length}`); return { feat: null, problems }; }
  const top = h1s[0];
  for (const b of page.root.blocks) fail(b.line, "content before the # heading");

  const m = top.title.match(/^(.+?)(?:\s+\[([A-Z]+)\])?$/);
  const name = m[1].trim();
  if (m[2] && !TYPES[m[2]]) fail(top.line, `unknown feat type [${m[2]}]`);

  const order = [];
  for (const s of top.children) {
    if (!SECTIONS.includes(s.title)) { fail(s.line, `unexpected section "## ${s.title}" (allowed: ${SECTIONS.join(", ")})`); continue; }
    if (order.includes(s.title)) fail(s.line, `"## ${s.title}" appears twice`);
    else if (order.length && SECTIONS.indexOf(s.title) < SECTIONS.indexOf(order.at(-1))) fail(s.line, `"## ${s.title}" comes after "## ${order.at(-1)}"`);
    order.push(s.title);
    if (!s.blocks.length && !s.children.length) fail(s.line, `"## ${s.title}" is empty`);
  }
  if (!order.includes("Benefit")) fail(top.line, "no ## Benefit section");
  for (const s of top.walk()) {
    for (const b of s.blocks) {
      if (b.kind === "label" && SECTIONS.concat("Prerequisite", "Benefits").includes(b.label)) {
        fail(b.line, `old-style label "**${b.label}:**"; use a "## ${b.label.replace(/s?$/, b.label.startsWith("Prereq") ? "s" : "")}" section`);
      }
    }
  }

  const html = (title) => {
    const s = top.child(title);
    if (!s) return "";
    return toHtml([...s.blocks.map((b) => b.node), ...[...s.walk()].slice(1).flatMap((c) => [c.heading, ...c.blocks.map((b) => b.node)])]);
  };
  const prereq = top.child("Prerequisites");
  const feat = {
    name, path, book: page.book,
    featType: TYPES[m[2]] ?? "general",
    description: toHtml(top.blocks.map((b) => b.node)),
    prerequisites: prereq ? text(prereq.blocks.map((b) => b.node)) : "",
    benefit: html("Benefit"), normal: html("Normal"), special: html("Special"),
  };
  return { feat, problems };
}

/** A feat's active effect, when its benefit is a fixed bonus (FEAT_EFFECTS): transferred to whoever owns it. */
function featEffects(itemId, feat) {
  const changes = FEAT_EFFECTS[feat.name];
  if (!changes) return [];
  const id = stableId(`feat-effect:${feat.path}`);
  return [{
    _id: id, _key: `!items.effects!${itemId}.${id}`, name: feat.name, img: ICON,
    changes: changes.map(([key, value]) => ({ key, mode: MODES.ADD, value: String(value), priority: null })),
    transfer: true, disabled: false, duration: {}, description: "", origin: null, statuses: [], flags: {},
  }];
}

/** Build the feats pack: `{ documents, problems, skipped }`. */
export function buildFeats() {
  const problems = [];
  const feats = [];
  for (const path of featPages()) {
    const { feat, problems: p } = readFeat(path);
    problems.push(...p);
    if (feat) feats.push(feat);
  }

  const { chosen, problems: dup, skipped } = resolveDuplicates(feats, DUPLICATES, "tools/build/feats.mjs");
  problems.push(...dup);
  const folders = {};
  const documents = [];
  for (const feat of chosen) {
    const folderId = (folders[feat.book] ??= stableId(`feat-folder:${feat.book}`));
    const id = stableId(`feat:${feat.path}`);
    documents.push({
      _id: id, _key: `!items!${id}`, name: feat.name, type: "feat", img: ICON, folder: folderId, sort: 0,
      system: {
        featType: feat.featType,
        prerequisites: feat.prerequisites,
        description: feat.description, benefit: feat.benefit, normal: feat.normal, special: feat.special,
        source: { book: BOOKS[feat.book] ?? feat.book, page: pageUuid(feat.path) },
      },
      effects: featEffects(id, feat), ownership: { default: 0 }, flags: { modern20: { srd: feat.path } },
    });
  }
  for (const [book, id] of Object.entries(folders)) {
    documents.push({ _id: id, _key: `!folders!${id}`, name: BOOKS[book] ?? book, type: "Item", folder: null, sorting: "a", color: null, flags: {} });
  }
  return { documents, problems, skipped };
}

/**
 * Look feats up by the name another page prints, for linking to the feats pack.
 *
 * Returns `resolve(text, book)`, which gives `{ name, specialty, uuid }` or null.
 * "Aircraft Operation (spacecraft)" resolves to Aircraft Operation with the
 * specialty "spacecraft". A feat split by book ("Wild Talent (Arcana)",
 * "Wild Talent (Modern)") resolves by its plain name to the copy from the
 * asking page's own book, else the core rulebook's.
 */
export function featLookup() {
  const byName = new Map();
  const add = (name, doc) => byName.set(name, [...(byName.get(name) ?? []), doc]);
  for (const doc of buildFeats().documents) {
    if (doc.type !== "feat") continue;
    add(doc.name, doc);
    const base = doc.name.replace(/ \([^)]*\)$/, "");
    if (base !== doc.name && DUPLICATES[base] === "suffix") add(base, doc);
  }
  const resolve = (text, book) => {
    let name = text, specialty = "";
    let docs = byName.get(name);
    const m = !docs && text.match(/^(.+?) \(([^)]+)\)$/);
    if (m && byName.get(m[1])) { [, name, specialty] = m; docs = byName.get(name); }
    if (!docs) return null;
    const doc = docs.find((d) => d.flags.modern20.srd.startsWith(`${book}/`)) ?? docs.find((d) => d.flags.modern20.srd.startsWith("Modern/")) ?? docs[0];
    return { name, specialty, uuid: `Compendium.modern20.feats.Item.${doc._id}` };
  };
  resolve.names = [...byName.keys()];
  return resolve;
}
