import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ASSETS = fileURLToPath(new URL("../../assets/", import.meta.url));
const credits = readFileSync(`${ASSETS}icons/CREDITS.md`, "utf8");

/** The credits file's list: author -> icon names. */
const listed = new Map();
for (const m of credits.matchAll(/^\*\*([\w-]+)\*\* — (.+)$/gm)) listed.set(m[1], new Set([...m[2].matchAll(/`([\w-]+)`/g)].map((x) => x[1])));

const files = (dir) => readdirSync(`${ASSETS}${dir}`, { withFileTypes: true }).filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(`${ASSETS}${dir}/${d.name}`).filter((f) => f.endsWith(".svg")).map((f) => [d.name, f.replace(/\.svg$/, "")]));

test("every icon and token is credited to its artist", () => {
  for (const dir of ["icons", "tokens"]) {
    for (const [author, name] of files(dir)) assert.ok(listed.get(author)?.has(name), `assets/${dir}/${author}/${name}.svg is not in assets/icons/CREDITS.md`);
  }
});

test("everything credited exists, and the count in the credits is right", () => {
  for (const [author, names] of listed) for (const name of names) assert.ok(existsSync(`${ASSETS}icons/${author}/${name}.svg`), `CREDITS.md lists ${author}/${name}, which is not in assets/icons`);
  const count = [...listed.values()].reduce((n, s) => n + s.size, 0);
  assert.match(credits, new RegExp(`The ${count} icons`));
});

test("the credits name the licence and say what was changed", () => {
  assert.match(credits, /creativecommons\.org\/licenses\/by\/3\.0/);
  assert.match(credits, /\*\*Changes:\*\*/);
});
