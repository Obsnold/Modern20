/**
 * Every SRD page as a journal entry.
 *
 * Each markdown file becomes one JournalEntry holding one text page, filed in
 * compendium folders that mirror the SRD's directories (Modern > Feats, ...).
 * Links between pages become `@UUID[...]{label}` links to the target's page, so
 * the rules journal is navigable inside Foundry the way the markdown is on
 * GitHub.
 */
import { once } from "./once.mjs";
import { posix } from "node:path";
import { listPages, readPage, toHtml, text } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";

export const BOOKS = { Modern: "d20 Modern", Arcana: "Urban Arcana", Future: "d20 Future", Menaces: "d20 Menace Manual" };

/** IDs for a page's journal entry and its single text page. */
export function journalIds(path) {
  return { entry: stableId(`journal:${path}`), page: stableId(`journal-page:${path}`) };
}

/** The UUID of a page's journal text, which items link to as their rules reference. */
export function pageUuid(path) {
  const { entry, page } = journalIds(path);
  return `Compendium.modern20.rules.JournalEntry.${entry}.JournalEntryPage.${page}`;
}

/** Replace links to other SRD pages with Foundry @UUID links; report the ones that lead nowhere. */
function rewriteLinks(nodes, from, known, problems) {
  const visit = (node) => {
    if (!node.children) return node;
    node.children = node.children.map((child) => {
      if (child.type === "link" && /\.md(#.*)?$/.test(child.url) && !/^[a-z]+:/i.test(child.url)) {
        const target = posix.normalize(posix.join(posix.dirname(from), child.url.replace(/#.*$/, "")));
        const label = text(child.children);
        if (!known.has(target)) {
          problems.push({ path: from, line: child.position?.start.line, message: `link to ${child.url} leads to no page` });
          return { type: "text", value: label };
        }
        return { type: "text", value: `@UUID[${pageUuid(target)}]{${label}}` };
      }
      return visit(child);
    });
    return node;
  };
  return nodes.map((n) => visit(structuredClone(n)));
}

/** Compendium folders for every directory that holds pages, nested like the SRD. */
function folders(paths) {
  const dirs = new Set();
  for (const p of paths) {
    const parts = p.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return [...dirs].sort().map((dir) => {
    const parent = dir.includes("/") ? stableId(`journal-folder:${posix.dirname(dir)}`) : null;
    const name = dir.includes("/") ? posix.basename(dir) : (BOOKS[dir] ?? dir);
    const id = stableId(`journal-folder:${dir}`);
    return { _id: id, _key: `!folders!${id}`, name, type: "JournalEntry", folder: parent, sorting: "a", color: null, flags: {} };
  });
}

/** Build the rules journal: `{ documents, problems }`. */
export const buildJournal = once(function buildJournal() {
  const paths = listPages();
  const known = new Set(paths);
  const problems = [];
  const documents = [...folders(paths)];
  for (const path of paths) {
    const page = readPage(path);
    const { entry, page: pageId } = journalIds(path);
    const html = toHtml(rewriteLinks(page.tree.children, path, known, problems));
    const dir = posix.dirname(path);
    documents.push({
      _id: entry, _key: `!journal!${entry}`, name: page.title,
      folder: dir === "." ? null : stableId(`journal-folder:${dir}`),
      sort: 0, ownership: { default: 0 }, flags: { modern20: { srd: path } },
      pages: [{
        _id: pageId, _key: `!journal.pages!${entry}.${pageId}`, name: page.title, type: "text",
        title: { show: false, level: 1 }, text: { format: 1, content: html },
        sort: 0, ownership: { default: -1 }, flags: {},
      }],
    });
  }
  return { documents, problems };
});
