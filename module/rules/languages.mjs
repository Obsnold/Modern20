/**
 * Languages (Modern/Skills/SpeakLanguage, ReadWriteLanguage). A character speaks, reads and
 * writes its native language without ranks, and knows those its species gives; each other
 * language it speaks is a rank of Speak Language in it, and each it reads and writes a rank of
 * Read/Write Language in it: the skills' specialties, one a language, bought on the Skills tab.
 * Some occupations let a character take a language in place of a skill.
 *
 * A character's languages known without ranks are `{ name, speak, readWrite, source }`, `source`
 * one of native, species or occupation.
 */

export const SOURCES = ["native", "species", "occupation"];

/**
 * The languages a species gives, from its printed list ("Speak Elven", "Read/Write Elven",
 * "Speak Language (any one)"), merged by language: a "(any one)" is a language left to name.
 */
export function speciesLanguages(free) {
  const out = [];
  for (const entry of free ?? []) {
    const m = entry.match(/^(Speak|Read\/Write)\s+(.+)$/i);
    if (!m) continue;
    const kind = /^speak/i.test(m[1]) ? "speak" : "readWrite";
    const name = /^Language \(any one\)$/i.test(m[2]) ? "" : m[2].trim();
    let lang = name ? out.find((l) => l.name === name) : out.find((l) => !l.name && !l[kind]);
    if (!lang) out.push((lang = { name, speak: false, readWrite: false, source: "species" }));
    lang[kind] = true;
  }
  return out;
}

/** The languages bought with ranks: each specialty of the language skills with a whole rank, `{ speak, readWrite }` names. */
export function rankedLanguages(specialtySkills) {
  const of = (skill) => (specialtySkills ?? []).filter((s) => s.skill === skill && s.specialty && Math.floor(s.ranks ?? 0) >= 1).map((s) => s.specialty);
  return { speak: of("speakLanguage"), readWrite: of("readWriteLanguage") };
}

/**
 * A character's data from before the language skills had a language each (a stored `skills` entry for
 * each, and languages marked bought with "ranks"): each such language a rank in its skill, as a
 * specialty, and gone from the languages known without ranks. Returns the data changed, or as it was.
 */
export function migrateLanguages(source) {
  const old = (source?.languages ?? []).filter((l) => l?.source === "ranks");
  const stored = ["speakLanguage", "readWriteLanguage"].filter((k) => source?.skills && k in source.skills);
  if (!old.length && !stored.length) return source;
  const specialtySkills = [...(source.specialtySkills ?? [])];
  const add = (skill, name) => {
    if (!name || specialtySkills.some((s) => s.skill === skill && s.specialty === name)) return;
    specialtySkills.push({ skill, specialty: name, ranks: 1, misc: 0, classSkill: !!source.skills?.[skill]?.classSkill, points: null });
  };
  for (const l of old) {
    if (l.speak) add("speakLanguage", l.name);
    if (l.readWrite) add("readWriteLanguage", l.name);
  }
  const skills = { ...source.skills };
  for (const k of stored) delete skills[k];
  return { ...source, skills, specialtySkills, languages: (source.languages ?? []).filter((l) => l?.source !== "ranks") };
}
