/**
 * Languages (Modern/Skills/SpeakLanguage, ReadWriteLanguage). A character speaks, reads and
 * writes its native language without ranks, and knows those its species gives; each other
 * language it speaks costs a rank of Speak Language, and each it reads and writes a rank of
 * Read/Write Language. Some occupations let a character take a language in place of a skill.
 *
 * A character's languages are `{ name, speak, readWrite, source }`, `source` one of native,
 * species, occupation or ranks: only those bought with ranks are held to the ranks.
 */

export const SOURCES = ["native", "species", "occupation", "ranks"];

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

/** Languages bought against the ranks in each skill: `{ speak: { have, ranks, over }, readWrite: ... }`. */
export function languageRanks(languages, { speakRanks = 0, readWriteRanks = 0 } = {}) {
  const bought = (languages ?? []).filter((l) => l.source === "ranks");
  const tally = (have, ranks) => ({ have, ranks: Math.floor(ranks), over: have > Math.floor(ranks), under: have < Math.floor(ranks) });
  return {
    speak: tally(bought.filter((l) => l.speak).length, speakRanks),
    readWrite: tally(bought.filter((l) => l.readWrite).length, readWriteRanks),
  };
}
