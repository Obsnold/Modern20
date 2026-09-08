const { DialogV2 } = foundry.applications.api;

/**
 * Starting occupation choices.
 *
 * The SRD states these as a sentence — "Choose three of the following skills
 * as permanent class skills" — so the importer parses the sentence into
 * options and this asks the player to pick from them. The chosen skills become
 * class skills through the actor's normal derivation, and the Wealth bonus is
 * applied once because Wealth erodes as a character buys things.
 */

const FEAT_PACK = "modern20.feats";

/** Ask the player to tick exactly `count` of the offered skills. */
async function chooseSkills(occupation) {
  const { skillOptions: options, skillChoiceCount: count } = occupation.system;
  if (!count || !options.length) return null;

  const boxes = options
    .map((option, index) => `
      <label class="m20-choice">
        <input type="checkbox" name="skill" value="${option.skill}" data-index="${index}">
        <span>${foundry.utils.escapeHTML(option.label || option.skill)}</span>
      </label>`)
    .join("");

  return DialogV2.prompt({
    window: { title: game.i18n.format("MODERN20.Occupation.SkillTitle", { name: occupation.name }) },
    content: `
      <p>${game.i18n.format("MODERN20.Occupation.SkillHint", { count })}</p>
      <div class="m20-choices">${boxes}</div>`,
    ok: {
      label: game.i18n.localize("MODERN20.Occupation.Confirm"),
      callback: (event, button, dialog) => {
        const ticked = [...dialog.element.querySelectorAll("input[name=skill]:checked")];
        return ticked.map((input) => input.value);
      }
    },
    rejectClose: false
  });
}

/** Ask the player to pick one of the offered bonus feats. */
async function chooseBonusFeat(occupation) {
  const options = occupation.system.bonusFeatOptions ?? [];
  if (!options.length) return null;

  const markup = options
    .map((name) => `<option value="${foundry.utils.escapeHTML(name)}">${foundry.utils.escapeHTML(name)}</option>`)
    .join("");

  return DialogV2.prompt({
    window: { title: game.i18n.format("MODERN20.Occupation.FeatTitle", { name: occupation.name }) },
    content: `
      <p>${game.i18n.localize("MODERN20.Occupation.FeatHint")}</p>
      <div class="m20-levelup"><select name="choice">${markup}</select></div>`,
    ok: {
      label: game.i18n.localize("MODERN20.Occupation.Confirm"),
      callback: (event, button, dialog) =>
        dialog.element.querySelector("select[name=choice]")?.value ?? null
    },
    rejectClose: false
  });
}

/** Add the named feat from the compendium, if it exists there. */
async function grantFeatByName(actor, name) {
  const pack = game.packs.get(FEAT_PACK);
  if (!pack || !name) return null;
  const feats = await pack.getDocuments();
  const match = feats.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    ui.notifications.warn(game.i18n.format("MODERN20.Occupation.FeatMissing", { name }));
    return null;
  }
  const [created] = await actor.createEmbeddedDocuments("Item", [match.toObject()]);
  return created;
}

/**
 * Run the choices for a newly added occupation. Everything is optional: a
 * dismissed prompt just leaves that part unchosen, and the occupation item can
 * be edited afterwards.
 */
export async function applyOccupation(actor, occupation) {
  const chosen = await chooseSkills(occupation);
  if (chosen?.length) {
    if (chosen.length !== occupation.system.skillChoiceCount) {
      ui.notifications.warn(game.i18n.format("MODERN20.Occupation.WrongCount", {
        picked: chosen.length, count: occupation.system.skillChoiceCount
      }));
    }
    await occupation.update({ "system.skillsChosen": chosen });
  }

  const feat = await chooseBonusFeat(occupation);
  if (feat) {
    await occupation.update({ "system.bonusFeatChosen": feat });
    await grantFeatByName(actor, feat);
  }

  // A one-time increase to starting Wealth, not an ongoing modifier.
  const bonus = occupation.system.wealthBonus ?? 0;
  if (bonus && actor.system.wealth !== undefined) {
    await actor.update({ "system.wealth.bonus": actor.system.wealth.bonus + bonus });
    ui.notifications.info(game.i18n.format("MODERN20.Info.OccupationWealth", {
      name: occupation.name, bonus
    }));
  }
}
