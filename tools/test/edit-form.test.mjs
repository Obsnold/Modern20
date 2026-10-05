import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { ITEM_MODELS, ACTOR_MODELS } from "../../module/data/models.mjs";
import { obj, conform } from "../../module/data/schema.mjs";
import { editForm, fromForm, specAt } from "../../module/sheets/edit-form.mjs";

const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** What a browser would submit for the form: every input's name and value, expanded to objects as Foundry does. */
function submit(html) {
  const flat = {};
  for (const m of html.matchAll(/<input type="(\w+)" name="([^"]+)"([^>]*)>/g)) {
    const [, type, name, rest] = m;
    if (type === "checkbox") flat[name] = / checked/.test(rest);
    else {
      const v = unescape(rest.match(/value="([^"]*)"/)?.[1] ?? "");
      flat[name] = type === "number" ? (v === "" ? null : Number(v)) : v;
    }
  }
  for (const m of html.matchAll(/<textarea name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) flat[m[1]] = unescape(m[2]);
  for (const m of html.matchAll(/<select name="([^"]+)">([\s\S]*?)<\/select>/g)) flat[m[1]] = unescape(m[2].match(/<option value="([^"]*)" selected>/)?.[1] ?? "");
  const out = {};
  for (const [path, v] of Object.entries(flat)) {
    const keys = path.split(".");
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = v;
  }
  return out;
}

test("every item and creature in the packs survives a round trip through its edit form", () => {
  const packs = ["classes", "talents", "feats", "spells", "powers", "incantations", "occupations", "species", "equipment", "creature-types", "templates", "creatures"];
  let n = 0;
  for (const pack of packs) {
    for (const doc of PACKS[pack]().documents.filter((d) => d.system)) {
      const spec = obj(doc.type === "creature" ? ACTOR_MODELS.creature : ITEM_MODELS[doc.type]);
      const source = conform(spec, doc.system);
      const back = fromForm(spec, submit(editForm(spec.fields, source)).system, source);
      assert.deepEqual(back, source, `${pack}: ${doc.name}`);
      n++;
    }
  }
  assert.ok(n > 1000, `${n} documents`);
});

test("an edit changes what was edited, lists of values one a line, and blank numbers as the field allows", () => {
  const spec = obj(ITEM_MODELS.class);
  const source = conform(spec, { hitPoints: [null, 5], classSkills: [], level: 2 });
  const back = fromForm(spec, { level: "3", hitPoints: "\n5\n7", maxLevel: "" }, source);
  assert.equal(back.level, 3);
  assert.deepEqual(back.hitPoints, [null, 5, 7]);
  assert.equal(back.maxLevel, 0);
  const cr = obj(ACTOR_MODELS.creature);
  assert.deepEqual(fromForm(cr, { languages: "Common (spoken, not written)\n\nElven" }, conform(cr, {})).languages, ["Common (spoken, not written)", "Elven"]);
});

test("a path below system finds its field description, through lists", () => {
  const spec = obj(ACTOR_MODELS.creature);
  assert.equal(specAt(spec, "skills").kind, "array");
  assert.equal(specAt(spec, "skills.0.bonus").kind, "number");
  assert.equal(specAt(spec, "nope"), null);
});
