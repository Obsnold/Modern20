/**
 * The change log: what changed on an actor, who changed it, and when.
 *
 * One log per actor, its entries of two kinds:
 *
 *   build   permanent changes to the character: abilities, levels, skill ranks,
 *           feats and gear added or removed, choices, details. Never pruned.
 *   play    what changes in a session: hit points, ability damage, action points, conditions and
 *           effects switched on and off, equipping, ammunition, dice rolls. The
 *           last PLAY_LIMIT are kept.
 *
 * What is play is listed here; anything not listed is build, so a change
 * nobody anticipated is kept rather than pruned.
 *
 * The log is stored in chunks, by kind (`{ build: { <key>: [...], ... }, play: { ... } }`),
 * each write's entries a chunk of their own under a new key: adding an entry sends that small
 * chunk rather than the whole log (at 500 session entries a single list would send well over
 * 100 KB with every hit point change), and two people writing at once (the GM and a player,
 * each rolling for the same character) never write the same chunk, so neither loses the other's
 * entries. Keys are numbers, in the order written (module/log.mjs makes them from the time).
 * Session entries are pruned a chunk at a time, oldest first, once more than PLAY_LIMIT are kept.
 * Plain functions over plain data, so the classification and the wording are tested;
 * module/log.mjs wires them to Foundry's hooks.
 */
import { SKILLS } from "../data/skills.mjs";

export const PLAY_LIMIT = 500;

/** Actor fields whose changes are play (temporary), not build. */
const PLAY_ACTOR_FIELDS = new Set([...["str", "dex", "con", "int", "wis", "cha"].map((a) => `system.abilities.${a}.damage`), "system.hp.value", "system.hp.temp", "system.hp.recovering", "system.actionPoints.value", "system.powerPoints.value", "system.powerPoints.freeUsed", "system.slotsUsed"]);
/** Item fields whose changes are play. */
const PLAY_ITEM_FIELDS = new Set(["system.charges.value", "system.equipped", "system.quantity", "system.prepared", "system.cast", "system.progress.successes", "system.progress.failures"]);

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SAVE_NAMES = { fort: "Fortitude", ref: "Reflex", will: "Will" };

/** Fields the log never records: the log itself, and Foundry's own bookkeeping. */
const IGNORED = [/^system\.hp\.lastMax$/, /^flags\.modern20\.log/, /^_stats/, /^sort$/, /^ownership/, /^folder$/, /^flags\.core/];

export const kindOfActorField = (path) => (PLAY_ACTOR_FIELDS.has(path) ? "play" : "build");
export const kindOfItemField = (path) => (PLAY_ITEM_FIELDS.has(path) ? "play" : "build");

/** A field's name as a person would say it: "system.skills.moveSilently.ranks" -> "Move Silently ranks". */
export function fieldLabel(path) {
  const p = path.replace(/^system\./, "");
  let m;
  if ((m = p.match(/^abilities\.(\w+)(?:\.value)?$/))) return ABILITY_NAMES[m[1]] ?? m[1];
  if ((m = p.match(/^abilities\.(\w+)\.(damage|drain)$/))) return `${ABILITY_NAMES[m[1]] ?? m[1]} ${m[2]}`;
  if ((m = p.match(/^skills\.(\w+)\.(ranks|misc|classSkill)$/))) return `${SKILLS[m[1]]?.name ?? m[1]} ${{ ranks: "ranks", misc: "misc bonus", classSkill: "as a class skill" }[m[2]]}`;
  if ((m = p.match(/^saves\.(\w+)$/))) return `${SAVE_NAMES[m[1]] ?? m[1]} save`;
  if ((m = p.match(/^details\.(\w+)$/))) return m[1][0].toUpperCase() + m[1].slice(1);
  const named = {
    name: "Name", img: "Portrait", "hp.value": "Current HP", "hp.temp": "Temp HP", "hp.max": "Max HP",
    "actionPoints.value": "Action points", "powerPoints.value": "Power points", "powerPoints.freeUsed": "Free 0-level powers used", slotsUsed: "Spell slots used", "wealth.value": "Wealth", "wealth.regainedLevel": "Wealth regained for level", languages: "Languages", "defense.misc": "Defense (misc)",
    specialtySkills: "Specialty skills", history: "Levels taken", ordinary: "Ordinary", level: "level", hitPoints: "hit point rolls", equipped: "equipped",
    quantity: "quantity", count: "Hit Dice", prepared: "prepared", cast: "cast", "progress.successes": "successes", "progress.failures": "failures in a row", choice: "choice", chosenSkills: "occupation skills", "prototypeToken.name": "Token name",
  };
  return named[p] ?? p.split(".").map((w) => w.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).join(" ");
}

/** A value as the log shows it. Long text and lists are summarised rather than copied. */
export function show(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object" || v === null)) return value.length ? value.map((v) => v ?? "—").join(", ") : "none";
    return `${value.length} ${value.length === 1 ? "entry" : "entries"}`;
  }
  if (typeof value === "object") return "(changed)";
  const s = String(value);
  return /<[a-z]/i.test(s) || s.length > 60 ? "(text changed)" : s;
}

/** Read a dotted path from an object. */
const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

/**
 * The entries for an update to an actor: `before` is the actor's data before
 * it, `changes` the update flattened to dotted paths. One entry per kind, so a
 * save that touches both hit points and Strength makes a play and a build entry.
 */
export function actorEntries(before, changes, meta) {
  const byKind = { build: [], play: [] };
  for (const [path, to] of Object.entries(changes)) {
    if (IGNORED.some((r) => r.test(path))) continue;
    const from = get(before, path);
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    byKind[kindOfActorField(path)].push({ label: fieldLabel(path), from: show(from), to: show(to) });
  }
  return Object.entries(byKind).filter(([, c]) => c.length).map(([kind, changes]) => ({ ...meta, kind, text: summary(changes), changes }));
}

/** The entries for an update to one of an actor's items. */
export function itemEntries(item, before, changes, meta) {
  const byKind = { build: [], play: [] };
  for (const [path, to] of Object.entries(changes)) {
    if (IGNORED.some((r) => r.test(path))) continue;
    const from = get(before, path);
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    const kind = kindOfItemField(path);
    if (path === "system.equipped") byKind.play.push({ label: item.name, from: from ? "equipped" : "not equipped", to: to ? "equipped" : "not equipped" });
    else byKind[kind].push({ label: `${item.name} ${fieldLabel(path)}`, from: show(from), to: show(to) });
  }
  return Object.entries(byKind).filter(([, c]) => c.length).map(([kind, changes]) => ({ ...meta, kind, text: summary(changes), changes }));
}

/** An item added or removed: build. */
export const itemAdded = (item, meta) => ({ ...meta, kind: "build", text: `Added ${typeLabel(item.type)} ${item.name}`, changes: [] });
export const itemRemoved = (item, meta) => ({ ...meta, kind: "build", text: `Removed ${typeLabel(item.type)} ${item.name}`, changes: [] });

/**
 * An effect added, removed or switched: a condition (an effect with statuses,
 * set from the token HUD) or switching an effect on or off is play; making or
 * deleting an effect of the character's own is build.
 */
export function effectEntry(effect, action, meta) {
  const condition = (effect.statuses?.length ?? effect.statuses?.size ?? 0) > 0;
  if (action === "toggle") return { ...meta, kind: "play", text: `${effect.disabled ? "Switched off" : "Switched on"} ${effect.name}`, changes: [] };
  const verb = action === "create" ? (condition ? "Now" : "Added effect") : (condition ? "No longer" : "Removed effect");
  return { ...meta, kind: condition ? "play" : "build", text: `${verb} ${condition ? effect.name.toLowerCase() : effect.name}`, changes: [] };
}

/** A dice roll: play. */
export const rollEntry = (title, total, meta) => ({ ...meta, kind: "play", text: `Rolled ${title}: ${total}`, changes: [] });

/** Every entry in a chunked log, oldest first. */
export function entries(log) {
  const all = [];
  for (const kind of ["build", "play"]) for (const key of chunkKeys(log?.[kind])) all.push(...log[kind][key]);
  return all.sort((a, b) => a.time - b.time || (a.seq ?? 0) - (b.seq ?? 0));
}

const chunkKeys = (chunks) => Object.keys(chunks ?? {}).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);

/**
 * Add `entries` to a chunked log, as a chunk of their own under `key` (by default the next number
 * after the log's last). Returns the update that does it, as flattened paths under `path` (only
 * the new chunks), the paths of the session chunks pruned (`removed`: the update deletes them,
 * module/log.mjs), and the log as it will be.
 */
export function append(log, newEntries, { limit = PLAY_LIMIT, path = "flags.modern20.log", key } = {}) {
  const next = { build: { ...(log?.build ?? {}) }, play: { ...(log?.play ?? {}) } };
  const at = key ?? Math.max(-1, ...chunkKeys(next.build), ...chunkKeys(next.play)) + 1;
  const update = {}, removed = [];
  for (const kind of ["build", "play"]) {
    const add = newEntries.filter((e) => e.kind === kind);
    if (!add.length) continue;
    next[kind][at] = [...(next[kind][at] ?? []), ...add];
    update[`${path}.${kind}.${at}`] = next[kind][at];
  }
  // Session entries past the limit: drop whole chunks, oldest first, while what is left still holds the limit.
  const keys = chunkKeys(next.play);
  let count = keys.reduce((n, k) => n + next.play[k].length, 0);
  while (keys.length > 1 && count - next.play[keys[0]].length >= limit) {
    const old = keys.shift();
    count -= next.play[old].length;
    delete next.play[old];
    removed.push(`${path}.play.${old}`);
  }
  return { update, removed, log: next };
}

const TYPE_LABELS = {
  class: "class", talent: "talent", feat: "feat", spell: "spell", power: "power", incantation: "incantation",
  occupation: "occupation", species: "species", creatureType: "creature type", template: "template", weapon: "weapon", armor: "armor", equipment: "equipment", ammunition: "ammunition",
};
const typeLabel = (type) => TYPE_LABELS[type] ?? type;

function summary(changes) {
  return changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join("; ");
}
