/**
 * Class features a character is given as its classes reach their levels. Each class's features
 * (`system.features`, each with the class levels it comes at and its item in the class features
 * pack) are given when the class reaches the first of those levels; `rank` counts how many it has
 * reached (Ability Surge at 2nd, 5th and 8th: rank 3 at 8th). Features of a level the class no
 * longer has, or of a class removed, are taken away.
 *
 * The character's copies are marked with the class they came from, so features added by hand are
 * left alone.
 */

/** The features `classes` (items `{ id, system: { level, features } }`) give: `[{ classId, name, uuid, rank }]`. */
export function featuresDue(classes) {
  const out = [];
  for (const c of classes) {
    const level = c.system.level ?? 0;
    for (const f of c.system.features ?? []) {
      if (!f.uuid) continue;
      const rank = (f.levels ?? []).filter((l) => l <= level).length;
      if (rank) out.push({ classId: c.id, name: f.name, uuid: f.uuid, rank });
    }
  }
  return out;
}

/**
 * What to change so the features a character has (`owned`: `[{ id, classId, name, rank }]`, those
 * given by a class) are the ones its classes give: `{ add, remove, ranks }`.
 */
export function featureChanges(due, owned) {
  const key = (x) => `${x.classId}:${x.name}`;
  const have = new Map(owned.map((o) => [key(o), o]));
  const want = new Map(due.map((d) => [key(d), d]));
  return {
    add: due.filter((d) => !have.has(key(d))),
    remove: owned.filter((o) => !want.has(key(o))).map((o) => o.id),
    ranks: owned.filter((o) => want.has(key(o)) && want.get(key(o)).rank !== o.rank).map((o) => ({ id: o.id, rank: want.get(key(o)).rank })),
  };
}
