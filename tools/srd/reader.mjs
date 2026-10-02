/**
 * Read the markdown SRD (the `srd/` submodule) into sections the importers can use.
 *
 * Every page is parsed with remark (CommonMark + GFM tables) into a tree of
 * sections, one per heading. A section keeps its content as an ordered list of
 * blocks, each with the line it starts on:
 *
 *   paragraph  plain prose
 *   label      a paragraph that opens with a bold label: `**Benefit:** ...`
 *   list       a bullet or numbered list
 *   stats      a two-column `| Stat | Value |` table, read as key/value pairs
 *   table      any other table, with the `**Table: ...**` caption above it
 *
 * The same parse renders HTML (for journal pages and item descriptions), so the
 * importers and the journal never read a page two different ways.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { toString } from "mdast-util-to-string";

/**
 * The SRD to read: the `srd/` submodule, or MODERN20_SRD to point at another
 * checkout (a working copy of D20ModernSRD with changes not yet pushed).
 */
export const SRD_ROOT = process.env.MODERN20_SRD
  ? join(process.env.MODERN20_SRD, "/")
  : fileURLToPath(new URL("../../srd/", import.meta.url));

/** Files in the submodule that are not SRD pages. */
const NOT_PAGES = new Set(["README.md"]);

const parser = unified().use(remarkParse).use(remarkGfm);
const renderer = unified().use(remarkRehype).use(rehypeStringify);

/** Every page in the SRD, as paths relative to the SRD root, sorted. */
export function listPages(root = SRD_ROOT) {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md") && !NOT_PAGES.has(name)) out.push(relative(root, full).split(sep).join("/"));
    }
  })(root);
  return out;
}

/** The text of an inline node or list of nodes, with markup removed and whitespace collapsed. */
export function text(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  return list.map((n) => toString(n)).join("").replace(/\s+/g, " ").trim();
}

/** Render mdast nodes (block or inline) to an HTML string. */
export function toHtml(nodes) {
  const children = Array.isArray(nodes) ? nodes : [nodes];
  const tree = { type: "root", children };
  return renderer.stringify(renderer.runSync(tree)).trim();
}

const line = (node) => node.position?.start.line ?? 0;

/** `**Label:** value` or `**Label**: value` at the start of a paragraph. */
function asLabel(p) {
  const [first, second] = p.children;
  if (first?.type !== "strong") return null;
  const name = text(first);
  if (name.endsWith(":")) return { label: name.slice(0, -1).trim(), rest: p.children.slice(1) };
  if (second?.type === "text" && second.value.startsWith(":")) {
    const rest = [{ ...second, value: second.value.slice(1) }, ...p.children.slice(2)];
    return { label: name, rest };
  }
  return null;
}

/** A paragraph that is only a bold `Table: ...` caption. */
function asCaption(p) {
  if (p.children.length !== 1 || p.children[0].type !== "strong") return null;
  const t = text(p.children[0]);
  return t.startsWith("Table:") ? t : null;
}

function tableRows(node) {
  return node.children.map((row) => ({ cells: row.children.map((c) => text(c.children)), nodes: row.children, line: line(row) }));
}

class Section {
  constructor(title, depth, lineNo, parent, heading) {
    Object.assign(this, { title, depth, line: lineNo, parent, heading, children: [], blocks: [] });
  }

  /** Every stat row in this section's own stat tables, key -> { value, line }. */
  get stats() {
    const out = {};
    for (const b of this.blocks) if (b.kind === "stats") for (const [k, v] of Object.entries(b.rows)) out[k] ??= v;
    return out;
  }

  /** Every bold label in this section's own paragraphs, label -> { value, line, nodes }. */
  get labels() {
    const out = {};
    for (const b of this.blocks) if (b.kind === "label") out[b.label] ??= b;
    return out;
  }

  /** The direct child section with this title. */
  child(title) {
    return this.children.find((c) => c.title === title) ?? null;
  }

  /** This section and everything below it, depth first. */
  *walk() {
    yield this;
    for (const c of this.children) yield* c.walk();
  }

  /** The heading path, for messages: `Wolf > Species Traits`. */
  get path() {
    const parts = [];
    for (let s = this; s && s.depth > 0; s = s.parent) parts.unshift(s.title);
    return parts.join(" > ");
  }
}

/**
 * Parse one page.
 *
 * Returns `{ path, book, title, tree, root }`. `root` is a depth-0 section
 * holding anything before the first heading; the page's H1 is its first child.
 */
export function readPage(path, root = SRD_ROOT) {
  const source = readFileSync(join(root, path), "utf8");
  const tree = parser.parse(source);
  const top = new Section(path, 0, 1, null, null);
  const stack = [top];
  let pendingCaption = null;

  for (const node of tree.children) {
    if (node.type === "heading") {
      while (stack.at(-1).depth >= node.depth) stack.pop();
      const s = new Section(text(node.children), node.depth, line(node), stack.at(-1), node);
      stack.at(-1).children.push(s);
      stack.push(s);
      pendingCaption = null;
      continue;
    }
    const here = stack.at(-1);
    if (node.type === "paragraph") {
      const caption = asCaption(node);
      if (caption) { pendingCaption = { caption, line: line(node) }; continue; }
      const lab = asLabel(node);
      if (lab) here.blocks.push({ kind: "label", label: lab.label, value: text(lab.rest), nodes: lab.rest, node, line: line(node) });
      else here.blocks.push({ kind: "paragraph", text: text(node.children), node, line: line(node) });
    } else if (node.type === "list") {
      here.blocks.push({
        kind: "list", ordered: !!node.ordered, node, line: line(node),
        items: node.children.map((li) => ({ text: text(li.children), node: li, line: line(li) })),
      });
    } else if (node.type === "table") {
      const [head, ...body] = tableRows(node);
      const header = head.cells;
      if (header.length === 2 && header[0] === "Stat" && header[1] === "Value") {
        const rows = {};
        for (const r of body) rows[r.cells[0]] ??= { value: r.cells[1] ?? "", line: r.line, nodes: r.nodes[1]?.children ?? [] };
        here.blocks.push({ kind: "stats", rows, node, line: line(node) });
      } else {
        here.blocks.push({ kind: "table", caption: pendingCaption?.caption ?? null, header, rows: body, node, line: line(node) });
      }
    } else {
      here.blocks.push({ kind: node.type, node, line: line(node) });
    }
    pendingCaption = null;   // a caption belongs only to the table directly after it
  }

  const h1 = top.children.find((s) => s.depth === 1);
  return { path, book: path.split("/")[0], title: h1?.title ?? path, tree, root: top, source };
}
