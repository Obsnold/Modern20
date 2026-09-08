/**
 * Verify that every {{formField fields.X}} in a template names a real schema field.
 *
 * This failure mode is silent: Handlebars renders an unknown field as nothing,
 * so a typo becomes a blank row on the sheet with no console error. It is the
 * hardest kind of bug to notice and the cheapest to catch mechanically.
 *
 * Also checks that block helpers are balanced, which Handlebars would only
 * report at render time.
 *
 *     node scripts/check_templates.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSystem } from "./lib/foundry-stubs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATES = join(ROOT, "templates");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (entry.endsWith(".hbs")) out.push(path);
  }
  return out;
}

/** Field names present in a schema, one level deep. */
function schemaFieldNames(cls) {
  try {
    return new Set(Object.keys(cls.defineSchema()));
  } catch {
    return null;
  }
}

/**
 * Walk a template tracking which document type the current lines apply to.
 * Templates branch with {{#if (eq document.type "weapon")}} ... {{/if}},
 * so a reference inside such a block only has to exist on that type.
 */
function scan(source) {
  const refs = [];
  const typeStack = [];
  let depth = 0;
  const openedTypeAt = new Map();

  source.split("\n").forEach((line, index) => {
    const typeOpen = line.match(/\{\{#if \(eq document\.type "(\w+)"\)\}\}/);
    const opens = (line.match(/\{\{#\w/g) ?? []).length;
    const closes = (line.match(/\{\{\/\w/g) ?? []).length;

    if (typeOpen) {
      depth += opens;
      typeStack.push(typeOpen[1]);
      openedTypeAt.set(typeStack.length, depth);
      for (const m of line.matchAll(/\bfields\.(\w+)/g)) {
        refs.push({ line: index + 1, field: m[1], type: typeOpen[1] });
      }
      depth -= closes;
      if (typeStack.length && depth < openedTypeAt.get(typeStack.length)) {
        openedTypeAt.delete(typeStack.length);
        typeStack.pop();
      }
      return;
    }

    depth += opens;
    for (const m of line.matchAll(/\bfields\.(\w+)/g)) {
      refs.push({ line: index + 1, field: m[1], type: typeStack.at(-1) ?? null });
    }
    depth -= closes;
    while (typeStack.length && depth < openedTypeAt.get(typeStack.length)) {
      openedTypeAt.delete(typeStack.length);
      typeStack.pop();
    }
  });

  return refs;
}

/**
 * `{{#each xs as |x|}}` introduces a lexically scoped parameter, reachable at
 * any depth without `../`. Writing `../x` instead looks x up on the *parent
 * context*, which silently yields undefined — a select whose selected option
 * never matches, so it always shows the first entry. Nothing throws.
 */
function blockParamMisuse(source) {
  const params = new Set();
  for (const match of source.matchAll(/\{\{#each\s+[^}]*?\s+as\s+\|([^|]+)\|\}\}/g)) {
    for (const name of match[1].trim().split(/\s+/)) params.add(name);
  }

  const problems = [];
  source.split("\n").forEach((line, index) => {
    for (const param of params) {
      if (new RegExp(`\\.\\./${param}\\b`).test(line)) {
        problems.push({ line: index + 1, param });
      }
    }
  });
  return problems;
}

function blockBalance(source) {
  // {{else}} and {{/if}} pair with an opener; {{#...}} opens one.
  const opens = (source.match(/\{\{#\w/g) ?? []).length;
  const closes = (source.match(/\{\{\/\w/g) ?? []).length;
  return opens - closes;
}

await loadSystem(join(ROOT, "module", "modern20.mjs"));

const actorSchemas = Object.fromEntries(
  Object.entries(CONFIG.Actor.dataModels ?? {}).map(([t, c]) => [t, schemaFieldNames(c)])
);
const itemSchemas = Object.fromEntries(
  Object.entries(CONFIG.Item.dataModels ?? {}).map(([t, c]) => [t, schemaFieldNames(c)])
);
const allSchemas = { ...actorSchemas, ...itemSchemas };

// A template under templates/actor/ describes an actor; item/ an item.
const anyItemField = new Set(Object.values(itemSchemas).flatMap((s) => [...(s ?? [])]));
const anyActorField = new Set(Object.values(actorSchemas).flatMap((s) => [...(s ?? [])]));

let problems = 0;
let refCount = 0;

for (const path of walk(TEMPLATES)) {
  const rel = relative(ROOT, path);
  const source = readFileSync(path, "utf8");

  for (const { line, param } of blockParamMisuse(source)) {
    problems++;
    console.log(`${rel}:${line}: "../${param}" — ${param} is a block parameter, `
      + `reachable directly; "../" resolves it against the parent context instead`);
  }

  const imbalance = blockBalance(source);
  if (imbalance !== 0) {
    problems++;
    console.log(`${rel}: ${imbalance > 0 ? imbalance + " unclosed" : -imbalance + " extra closing"} block helper(s)`);
  }

  const isItem = rel.includes("/item/");
  for (const ref of scan(source)) {
    refCount++;
    if (ref.type) {
      const schema = allSchemas[ref.type];
      if (!schema) {
        problems++;
        console.log(`${rel}:${ref.line}: unknown document type "${ref.type}"`);
      } else if (!schema.has(ref.field)) {
        problems++;
        console.log(`${rel}:${ref.line}: "${ref.type}" has no field "${ref.field}"`);
      }
    } else {
      const pool = isItem ? anyItemField : anyActorField;
      if (!pool.has(ref.field)) {
        problems++;
        console.log(`${rel}:${ref.line}: no ${isItem ? "item" : "actor"} type has a field "${ref.field}"`);
      }
    }
  }
}

console.log(`\n${refCount} field references checked, ${problems} problems`);
process.exit(problems ? 1 : 0);
