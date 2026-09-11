/**
 * Where the rules for a topic are, generated from data/rules.json by
 * scripts/gen_rules_links.py.
 *
 * Every compendium document carries its own page in `system.rulesPage`. These
 * are for the things that are not documents: the ability scores a panel of the
 * sheet shows, the Wealth box, the skill each row of the skills table is. The
 * page each one means is chosen in the generator, where the reason is written
 * down; the UUIDs are derived from the SRD.
 *
 * A world without the rules compendium installed simply has no page to open,
 * which module/rules.mjs reports rather than throwing.
 */

/** The page for a topic the sheets name. */
export const RULES_TOPICS = {
  "abilities": "Compendium.modern20.rules.JournalEntry.16slDxAW5vS4A9Dt.JournalEntryPage.DL7eGoVYJXLEBKqE",
  "saves": "Compendium.modern20.rules.JournalEntry.BW08qOlRSlaENtxF.JournalEntryPage.Mg231VpouUwQOIgn",
  "combat": "Compendium.modern20.rules.JournalEntry.BW08qOlRSlaENtxF.JournalEntryPage.Mg231VpouUwQOIgn",
  "actions": "Compendium.modern20.rules.JournalEntry.BW08qOlRSlaENtxF.JournalEntryPage.xVeceLLGwBCsmvvL",
  "injuryAndDeath": "Compendium.modern20.rules.JournalEntry.jKIIXj3FVTQ6RmtB.JournalEntryPage.DYtd2iDnRXllMrpj",
  "nonlethalDamage": "Compendium.modern20.rules.JournalEntry.jKIIXj3FVTQ6RmtB.JournalEntryPage.OGHQ4OelHjiM3pEF",
  "actionPoints": "Compendium.modern20.rules.JournalEntry.M6kVCrrZywdkvkEz.JournalEntryPage.aWSa9p2Q7NHK5WqR",
  "reputation": "Compendium.modern20.rules.JournalEntry.Mhsof9pBONxgNuWI.JournalEntryPage.s1bhufphIXMKXAW5",
  "wealth": "Compendium.modern20.rules.JournalEntry.mHK8Op4Y0OGVi9lU.JournalEntryPage.v7BRwW32qvUoXa3Q",
  "massiveDamage": "Compendium.modern20.rules.JournalEntry.jKIIXj3FVTQ6RmtB.JournalEntryPage.4ufmb54q49RyUIIr",
  "skills": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.tnsUcIFoUlGFrR5j",
  "carryingCapacity": "Compendium.modern20.rules.JournalEntry.KEk4tUapzxsIoENq.JournalEntryPage.kWCLDt8qV6bZlAut",
  "blackMarket": "Compendium.modern20.rules.JournalEntry.KEk4tUapzxsIoENq.JournalEntryPage.J6KyMftxwwbtntMt",
  "fx": "Compendium.modern20.rules.JournalEntry.hXGxrY1r1Ec6LQTW.JournalEntryPage.KD7TtIMkLsOPA3pD",
  "creatureTypes": "Compendium.modern20.rules.JournalEntry.y98NYAYGT9GM5Mox.JournalEntryPage.gas3DWxlxTx3B2BH",
  "specialAbilities": "Compendium.modern20.rules.JournalEntry.y98NYAYGT9GM5Mox.JournalEntryPage.vhTyLUgTw1jBipWT",
  "advancingCreatures": "Compendium.modern20.rules.JournalEntry.y98NYAYGT9GM5Mox.JournalEntryPage.br2v6E86n7NATaQr",
  "objects": "Compendium.modern20.rules.JournalEntry.BW08qOlRSlaENtxF.JournalEntryPage.ZVIRSi83JXUEeVf3",
  "progressLevels": "Compendium.modern20.rules.JournalEntry.Woruh23Qi90qEF3e.JournalEntryPage.QLWouoldmm11vAO5"
};

/**
 * The page for each skill, and for the specialties the SRD describes one at a
 * time: `craft:chemical` has a page, `knowledge:streetwise` does not.
 */
export const SKILL_RULES = {
  "balance": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.ATVcxrSLjTkxuQ5f",
  "bluff": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.LyRnZfTxjztneQkf",
  "climb": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.2hRm1ZaVbhridrcI",
  "computerUse": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.r1gqy80KYBRp4LYZ",
  "concentration": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.BEk4HqDaERuRd33s",
  "craft": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.qpQh3TJmR1ubpwFM",
  "craft:chemical": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.ebOOlIrqlZohHPOx",
  "craft:electronic": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.2hfpDkKl1z1SVEm8",
  "craft:mechanical": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.vg1gQ62aqMwRahhw",
  "craft:pharmaceutical": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.Lah1f4Xk9IRHp2HQ",
  "craft:structural": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.ts9LUgF3VeQTc4Xv",
  "craft:visual art": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.wAvqIKrTw0Xp9iRz",
  "craft:writing": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.i7KqRqPF8FthwaYA",
  "decipherScript": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.Oycdh2esKNZGiGiK",
  "demolitions": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.tCIE24oiU16SJK7q",
  "diplomacy": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.8qMJagJCAcBk7gUu",
  "disableDevice": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.N9FPDP4EoLad3XVc",
  "disguise": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.1SnbjeIG7F7jtGX5",
  "drive": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.tEQBtVED9xOBYxhg",
  "escapeArtist": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.dV9fm96ZEfjZHQIt",
  "forgery": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.gzLfMjifgQSFHdeX",
  "gamble": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.fIMyuIt2DLkIPKM1",
  "gatherInformation": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.6qWR6GX9WeJ3yuOY",
  "handleAnimal": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.PBe05Wog0BSKJGDb",
  "hide": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.yLwcdbVN7R0oIryD",
  "intimidate": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.hGaG9VKX3XzZsHbi",
  "investigate": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.TKyd8MsEAw5ctTeG",
  "jump": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.jBiXy1OJ7fns7KIJ",
  "knowledge": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.u2wKtP0lCViwRSJh",
  "listen": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.SkEQYSJWnINdHy6d",
  "moveSilently": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.gRGOU4U7HPLBKsFT",
  "navigate": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.MuXSN8LFfO25XGDC",
  "perform": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.bYxo1zAyI4nLX5Xz",
  "pilot": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.O8l3D7Sgk71lO3oU",
  "profession": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.Nf2nnvPM1SrmwEtY",
  "readWriteLanguage": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.t2XyT06OJpXdRecn",
  "repair": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.t5BfhUiUiCgiNzxq",
  "research": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.XZW37LpoJMAhv5QP",
  "ride": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.LU4d7TYkvIU0fJ2m",
  "search": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.tBx3tJQk1KI6goxO",
  "senseMotive": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.qzAw11rmpSBSlKj2",
  "sleightOfHand": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.rqMI2gFnT33H8Dh7",
  "speakLanguage": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.ga8l1gHa6BSWcAsi",
  "spot": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.FNM3zJ0yNmRXsRp8",
  "survival": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.BhelFSV3HUgcbrPM",
  "swim": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.sde7ybialqiF0RSV",
  "treatInjury": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.FmARSDyDSsFtIztu",
  "tumble": "Compendium.modern20.rules.JournalEntry.Uuaoqg08HvQpYRGt.JournalEntryPage.su1kXi9i7Af8beog"
};
