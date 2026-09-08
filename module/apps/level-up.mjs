const { DialogV2 } = foundry.applications.api;

/**
 * Level-up choices.
 *
 * A class progression row names what the level grants: "Talent" at odd levels
 * for a basic class, "Bonus Feat" at even ones, and named features for
 * advanced classes. Applying the numbers without prompting for these leaves a
 * character quietly incomplete, so gaining a level offers the right pick.
 *
 * Nothing here is mandatory. Every prompt can be dismissed, and prerequisites
 * are shown rather than enforced, consistent with the rest of the system.
 */

const TALENT_PACK = "modern20.talents";
const FEAT_PACK = "modern20.feats";

/** Documents from a compendium, or an empty array if it is not installed. */
async function packDocuments(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return [];
  return pack.getDocuments();
}

/** Build a labelled <select>, grouped when the entries carry a group name. */
function selectMarkup(entries, { name = "choice", groupBy = null } = {}) {
  if (!groupBy) {
    const options = entries
      .map((e) => `<option value="${e.uuid}">${foundry.utils.escapeHTML(e.name)}</option>`)
      .join("");
    return `<select name="${name}">${options}</select>`;
  }

  const groups = new Map();
  for (const entry of entries) {
    const key = entry[groupBy] || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const markup = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => {
      const options = items
        .map((e) => `<option value="${e.uuid}">${foundry.utils.escapeHTML(e.name)}</option>`)
        .join("");
      return group
        ? `<optgroup label="${foundry.utils.escapeHTML(group)}">${options}</optgroup>`
        : options;
    })
    .join("");

  return `<select name="${name}">${markup}</select>`;
}

/** Ask the player to pick one document. Returns its uuid, or null if dismissed. */
async function chooseOne({ title, hint, entries, groupBy }) {
  if (!entries.length) return null;

  const content = `
    <p>${hint}</p>
    <div class="m20-levelup">${selectMarkup(entries, { groupBy })}</div>
  `;

  return DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: game.i18n.localize("MODERN20.LevelUp.Add"),
      callback: (event, button, dialog) =>
        dialog.element.querySelector("select[name=choice]")?.value ?? null
    },
    rejectClose: false
  });
}

/** Add a compendium document to the actor by uuid. */
async function grant(actor, uuid) {
  if (!uuid) return null;
  const document = await fromUuid(uuid);
  if (!document) return null;
  const [created] = await actor.createEmbeddedDocuments("Item", [document.toObject()]);
  return created;
}

/** Talents the character does not already have, from this class's trees. */
async function talentChoices(actor, classItem) {
  const owned = new Set(actor.items.filter((i) => i.type === "talent").map((i) => i.name));
  const talents = await packDocuments(TALENT_PACK);
  return talents
    .filter((t) => t.system.sourceClass === classItem.name && !owned.has(t.name))
    .map((t) => ({ uuid: t.uuid, name: t.name, tree: t.system.tree }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Feats the character does not already have, unless the feat repeats. */
async function featChoices(actor) {
  const owned = new Set(actor.items.filter((i) => i.type === "feat").map((i) => i.name));
  const feats = await packDocuments(FEAT_PACK);
  return feats
    .filter((f) => f.system.repeatable || !owned.has(f.name))
    .map((f) => ({ uuid: f.uuid, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A named class feature, e.g. an advanced class's "Weapon Focus".
 *
 * Some of these are real feats that exist in the compendium; the rest are
 * unique to the class. Grant the feat when one matches by name, and otherwise
 * record the feature as a talent so it is at least visible on the sheet.
 */
async function grantNamedFeature(actor, classItem, feature, level) {
  const feats = await packDocuments(FEAT_PACK);
  const match = feats.find((f) => f.name.toLowerCase() === feature.toLowerCase());
  if (match) return grant(actor, match.uuid);

  const [created] = await actor.createEmbeddedDocuments("Item", [{
    name: feature,
    type: "talent",
    img: "icons/svg/statue.svg",
    system: {
      tree: game.i18n.localize("MODERN20.LevelUp.ClassFeature"),
      sourceClass: classItem.name,
      description: game.i18n.format("MODERN20.LevelUp.GrantedAt", {
        name: classItem.name, level
      })
    }
  }]);
  return created;
}

/**
 * Offer the choices a class level grants. Called after the level is applied,
 * so the numbers are already correct whether or not the player picks anything.
 */
export async function promptLevelUpChoices(actor, classItem, level) {
  const row = classItem.system.progression.find((r) => r.level === level);
  const features = row?.features ?? [];
  if (!features.length) return [];

  const granted = [];
  for (const feature of features) {
    if (/^talents?$/i.test(feature)) {
      const entries = await talentChoices(actor, classItem);
      if (!entries.length) {
        ui.notifications.info(game.i18n.format("MODERN20.LevelUp.NoTalents", { name: classItem.name }));
        continue;
      }
      const uuid = await chooseOne({
        title: game.i18n.format("MODERN20.LevelUp.TalentTitle", { name: classItem.name, level }),
        hint: game.i18n.localize("MODERN20.LevelUp.TalentHint"),
        entries,
        groupBy: "tree"
      });
      const item = await grant(actor, uuid);
      if (item) granted.push(item);
    } else if (/bonus feat/i.test(feature)) {
      const entries = await featChoices(actor);
      const uuid = await chooseOne({
        title: game.i18n.format("MODERN20.LevelUp.FeatTitle", { level }),
        hint: game.i18n.localize("MODERN20.LevelUp.FeatHint"),
        entries
      });
      const item = await grant(actor, uuid);
      if (item) granted.push(item);
    } else {
      const item = await grantNamedFeature(actor, classItem, feature, level);
      if (item) granted.push(item);
    }
  }

  if (granted.length) {
    ui.notifications.info(game.i18n.format("MODERN20.LevelUp.Granted", {
      names: granted.map((i) => i.name).join(", ")
    }));
  }
  return granted;
}
