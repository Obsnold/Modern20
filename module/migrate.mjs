import { setting } from "./settings.mjs";

/**
 * What a world already playing needs done to it when this system changes.
 *
 * `DataModel.migrateData` handles a field that moved or changed shape: it runs
 * on every document as it loads, in the world and in the compendia, and needs
 * no pass like this one. What it cannot do is fill in something that was never
 * there. A creature imported into a world last month has the token Foundry
 * gave it — one square, no vision — because the compendium it came from had no
 * token to copy, and nothing about loading that actor will ever change it.
 *
 * So this is for derived data that arrived after the world did, and it changes
 * only what is still the default it was given. A token somebody resized is a
 * decision; a token nobody has touched is arithmetic waiting to happen.
 */

const SYSTEM_ID = "modern20";

// Where this system keeps its two cuts of the same drawing: a tile for the
// sheets, a disc for the canvas.
const ICONS = "systems/modern20/assets/icons/";
const TOKENS = "systems/modern20/assets/tokens/";

/**
 * What a creature of each size fills, in grid squares: the SRD's own Space
 * column over the five feet a square is, with half a square as the floor for
 * everything Tiny and smaller. The table the import builds tokens from.
 */
const TOKEN_SQUARES = {
  fine: 0.5, diminutive: 0.5, tiny: 0.5, small: 1, medium: 1,
  large: 2, huge: 3, gargantuan: 4, colossal: 6
};

/** The same column in feet, for the space an actor occupies. */
const SPACE_FT = {
  fine: 0.5, diminutive: 1, tiny: 2.5, small: 5, medium: 5,
  large: 10, huge: 15, gargantuan: 20, colossal: 30
};

/** The size an actor is, wherever its schema keeps it. */
function sizeOf(actor) {
  return actor.system?.attributes?.size ?? actor.system?.size ?? "";
}

export async function migrateWorld() {
  if (!game.user?.isGM) return null;

  const from = setting("worldVersion");
  const to = game.system.version;
  if (from === to) return null;

  const counted = { tokens: 0, placed: 0, spaces: 0 };
  try {
    counted.tokens = await migrateActors();
    counted.placed = await migratePlacedTokens();
  } catch (error) {
    // A failed migration must not stamp the version, or the next load will
    // think the work was done.
    console.error(`${SYSTEM_ID} | migration failed`, error);
    ui.notifications.error(game.i18n.localize("MODERN20.Migration.Failed"));
    return null;
  }

  await game.settings.set(SYSTEM_ID, "worldVersion", to);
  if (counted.tokens || counted.placed) {
    ui.notifications.info(game.i18n.format("MODERN20.Migration.Done", counted));
  }
  return counted;
}

/**
 * Give an actor the token and the space its size implies.
 *
 * Only where the token is still one square and the size says otherwise: a
 * Gargantuan wyrm on a 1x1 token is the default nobody chose, and a Medium
 * creature on a 2x2 token is somebody's decision.
 */
async function migrateActors() {
  const updates = [];
  for (const actor of game.actors ?? []) {
    const size = sizeOf(actor);
    const squares = TOKEN_SQUARES[size];
    if (!squares) continue;

    const update = { _id: actor.id };
    const token = actor.prototypeToken ?? {};
    if (squares !== 1 && token.width === 1 && token.height === 1) {
      update.prototypeToken = { width: squares, height: squares };
    }

    // The artwork the token was never given, which is Foundry's default and
    // so nobody's choice.
    const source = token.texture?.src ?? "";
    if (!source || source === CONST.DEFAULT_TOKEN) {
      const art = tokenArtFor(actor);
      if (art) {
        update.prototypeToken = { ...(update.prototypeToken ?? {}),
                                  texture: { src: art } };
      }
    }
    // The space the SRD prints, which was stored as a flat five for every
    // creature until the stat block's own FS/Reach line was read properly.
    if (actor.system?.attributes?.space === 5 && SPACE_FT[size] !== 5) {
      update["system.attributes.space"] = SPACE_FT[size];
    }
    if (Object.keys(update).length > 1) updates.push(update);
  }

  if (updates.length) {
    const { Actor } = foundry.documents;
    await Actor.updateDocuments(updates);
  }
  return updates.length;
}

/**
 * The artwork a token was never given.
 *
 * An actor imported before the compendium had any has Foundry's own
 * `CONST.DEFAULT_TOKEN` on its prototype token — the grey mystery-man — and
 * nothing about loading it will ever change that. The actor's own image is
 * the one chosen for what it is, and its disc is the same drawing cut for a
 * map, so that is what the token gets. Only where the token is still the
 * default: art somebody chose is a decision.
 */
function tokenArtFor(actor) {
  const image = actor.img ?? "";
  if (!image.startsWith(ICONS)) return "";
  return TOKENS + image.slice(ICONS.length);
}

/**
 * The tokens already standing on a map, which carry their own copy of the
 * size they were dropped at. Fixing the actor does not move them.
 */
async function migratePlacedTokens() {
  let changed = 0;
  for (const scene of game.scenes ?? []) {
    const updates = [];
    for (const token of scene.tokens ?? []) {
      const squares = TOKEN_SQUARES[sizeOf(token.actor ?? {})];
      if (!squares || squares === 1) continue;
      if (token.width !== 1 || token.height !== 1) continue;
      updates.push({ _id: token.id, width: squares, height: squares });
    }
    if (updates.length) {
      await scene.updateEmbeddedDocuments("Token", updates);
      changed += updates.length;
    }
  }
  return changed;
}
