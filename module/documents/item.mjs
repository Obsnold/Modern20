import { MODERN20 } from "../config.mjs";
import { resolveAttack, postAttackCard, postSaveCard, postCastCard, rollItemDamage } from "../apps/attack.mjs";
import { availableActivities, defaultActivities } from "../apps/activities.mjs";
import { accessoriesOf, reloadAction, ammunitionFor, carriedAmmunition, magazineSize } from "../apps/accessories.mjs";
import { activityAction } from "../apps/actions.mjs";
import { Modern20AttackDialog } from "../apps/attack-dialog.mjs";
import { announce, acknowledge, problem } from "../apps/announce.mjs";
import { setting } from "../settings.mjs";

const { Item, ChatMessage } = foundry.documents;
const { Roll } = foundry.dice;

export class Modern20Item extends Item {
  /**
   * The circumstances chosen for the last attack, offered again on the next.
   *
   * A fight rarely changes what applies from one round to the next — the same
   * cover, the same flanking — and re-ticking them every attack is the part of
   * a modifier dialog that people turn off.
   */
  static #lastModifiers = {};

  /**
   * Whether to ask about circumstance modifiers.
   *
   * "always" asks unless shift is held; "shift" inverts that, so a plain click
   * rolls straight through and shift opens the dialog; "never" never asks.
   * Client-scoped, since it is a preference about rolling rather than a rule.
   */
  static #wantsDialog(shiftKey) {
    const mode = setting("attackDialog");
    if (mode === "never") return false;
    // "shift" inverts the default: a plain click rolls, shift asks.
    if (mode === "shift") return Boolean(shiftKey);
    return !shiftKey;
  }

  /**
   * Seed a new item with the activities its type starts with.
   *
   * Compendium items already carry theirs from the build, so this only fires
   * for items made by hand. Same data either way.
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    if (foundry.utils.isEmpty(this.system.activities ?? {})) {
      const seeded = defaultActivities(this.type, this.system);
      if (!foundry.utils.isEmpty(seeded)) {
        this.updateSource({ "system.activities": seeded });
      }
    }
    return allowed;
  }

  getRollData() {
    const data = { ...(this.actor?.getRollData() ?? {}) };
    data.item = { ...this.system };
    return data;
  }

  /** Post the item to chat, or use its first activity if it has one. */
  async roll() {
    const first = this.activities[0];
    if (first) return this.use(first.id);
    return this.toChat();
  }

  /**
   * Use one of this item's activities, dispatching on its type.
   *
   * A weapon fires an attack; an explosive detonates against a save; a spell
   * either forces a save or simply happens, and its card carries its text so
   * the table can apply what the SRD describes in prose.
   */
  async use(activityId = "", { shiftKey = false } = {}) {
    const activity = this.activities.find((entry) => entry.id === activityId)
      ?? this.activities[0];
    if (!activity) return this.toChat();

    const card = activity.type === "attack"
      ? this.rollAttack({ activityId: activity.id, spendAction: false, shiftKey })
      : activity.type === "save"
        ? postSaveCard(this, activity)
        : postCastCard(this, activity);

    const result = await card;
    // A cancelled attack dialog costs nothing and consumes nothing.
    if (result === null && activity.type === "attack") return null;
    await this.#spendCastingResource();
    await this.actor?.spendAction(activityAction(activity));
    return result;
  }

  /**
   * A full attack: every attack a high base attack bonus grants.
   *
   * "If a character gets more than one attack per action because his or her
   * base attack bonus is high enough... the character must use the full attack
   * action to get his or her additional attacks." Each attack after the first
   * is at the lower bonus the table gives, applied as a penalty on top of the
   * character's own attack bonus.
   */
  async fullAttack({ activityId = "shot", shiftKey = false } = {}) {
    if (this.type !== "weapon") throw new Error("Only weapons can make a full attack");
    const sequence = this.actor?.attackSequence ?? [0];

    // Asked once for the whole sequence: the circumstances do not change
    // between attacks made in the same action.
    let modifiers = {};
    if (Modern20Item.#wantsDialog(shiftKey)) {
      modifiers = await new Modern20AttackDialog(this, {
        activityId, remembered: Modern20Item.#lastModifiers
      }).prompt();
      if (!modifiers) return null;
      Modern20Item.#lastModifiers = modifiers;
    }

    const results = [];
    for (const bonus of sequence) {
      // The sequence is absolute bonuses; resolveAttack already adds the
      // character's own, so each attack after the first carries the drop from
      // the first as its situational modifier.
      results.push(await this.rollAttack({
        situational: bonus - sequence[0], activityId, spendAction: false, modifiers
      }));
    }

    await this.actor?.spendAction("fullRound");
    return results;
  }

  /**
   * Spend what casting this costs: a spell slot of its level, or the power
   * points the power lists.
   *
   * "He is limited to a certain number of spells of each spell level per day",
   * and a psionic character "just pays the power point cost of a power to
   * manifest it". Reported rather than enforced — an empty pool warns, it does
   * not refuse, since scrolls, items and the GM all cast around the table.
   */
  async #spendCastingResource() {
    if (!this.actor) return;

    if (this.type === "spell") {
      // A prepared count, where the player set one, comes off first: it is
      // the specific spell, where the slot is only its level.
      if (this.system.prepared > 0) {
        await this.update({ "system.prepared": this.system.prepared - 1 });
      }
      await this.actor.spendSpellSlot(this.system.tradition, this.castingLevel);
      return;
    }

    if (this.type === "psiPower") {
      await this.actor.spendPowerPoints(this.system.powerPoints ?? 0);
    }
  }

  /**
   * The DC of a save this item's activity imposes.
   *
   * "The Difficulty Class for saving throws to resist the effects of a Mage's
   * spells is 10 + the spell's level + the Mage's Intelligence modifier", and
   * a psionic power reads the same with the power's own key ability. An
   * explosive's DC is printed on the weapon instead and needs no caster.
   */
  saveDC(activity) {
    const save = activity?.save;
    if (!save) return null;
    if (save.calculation !== "caster") return save.dc;

    const ability = this.castingAbility;
    const mod = ability ? this.actor?.system?.abilities?.[ability]?.mod ?? 0 : 0;
    return 10 + this.castingLevel + mod;
  }

  /**
   * The ability that sets this item's save DC.
   *
   * A spell's comes from its tradition — arcane casting keys off Intelligence,
   * divine off Wisdom — while a power's is a property of the power itself:
   * "Each psionic power is tied to a specific ability".
   */
  get castingAbility() {
    if (this.type === "psiPower") return this.system.keyAbility || "cha";
    if (this.type !== "spell") return "";
    return this.system.tradition === "divine" ? "wis" : "int";
  }

  /** The level this counts as: a spell's is the level on the list it was cast from. */
  get castingLevel() {
    if (this.type !== "spell") return this.system.level ?? 0;
    return this.system.lists?.[this.system.tradition] ?? this.system.level ?? 0;
  }

  /**
   * Roll an attack, resolved against the target's Defense where one is
   * targeted, with threats confirmed. The detail lives in apps/attack.mjs.
   */
  /**
   * Roll an attack.
   *
   * @param {object}  [options]
   * @param {number}  [options.situational]  A flat modifier, added to whatever
   *   the dialog contributes.
   * @param {boolean} [options.shiftKey]     Whether shift was held, which
   *   skips or opens the circumstance dialog depending on the setting.
   * @param {object}  [options.modifiers]    Circumstances already chosen, used
   *   by a full attack so the dialog is answered once for the sequence.
   */
  async rollAttack({
    situational = 0, activityId = "shot", spendAction = true,
    shiftKey = false, modifiers = null
  } = {}) {
    if (this.type !== "weapon") throw new Error("Only weapons can roll attacks");

    if (!this.system.equipped) {
      problem(game.i18n.format("MODERN20.Equip.NotEquipped", { name: this.name }));
    }

    let chosen = modifiers;
    if (!chosen && Modern20Item.#wantsDialog(shiftKey)) {
      chosen = await new Modern20AttackDialog(this, {
        activityId,
        remembered: Modern20Item.#lastModifiers
      }).prompt();
      // Dismissed rather than rolled: cancel, do not roll a set of ticks the
      // player was still looking at.
      if (!chosen) return null;
      Modern20Item.#lastModifiers = chosen;
    }

    const result = await resolveAttack(this, { situational, activityId, modifiers: chosen });
    await postAttackCard(this, result);

    // A full attack pays once for the whole sequence, so it opts out here.
    if (spendAction) {
      await this.actor?.spendAction(activityAction(result.activity));
    }

    // Each mode spends its own amount: one round, five for a burst, ten on
    // autofire.
    if (this.system.ammo?.max) {
      const remaining = this.system.ammo.value - result.ammoSpent;
      if (remaining < 0) {
        await announce(this.actor, {
          title: game.i18n.format("MODERN20.Attack.NoAmmo", { name: this.name }),
          img: this.img, warning: true
        });
      } else {
        await this.update({ "system.ammo.value": remaining });
      }
    }

    return result;
  }

  /**
   * Damage from any item that deals it, doubled by rolling twice on a critical.
   *
   * The target is carried through from the attack: "Damage from Colt M1911"
   * says nothing useful when read back an hour later, and who it was aimed at
   * is the line a battle log exists for.
   */
  async rollDamage({ critical = false, activityId = "", targetName = "" } = {}) {
    const roll = await rollItemDamage(this, { critical, activityId });
    const key = targetName
      ? (critical ? "MODERN20.Chat.CriticalDamageAt" : "MODERN20.Chat.DamageAt")
      : (critical ? "MODERN20.Chat.CriticalDamage" : "MODERN20.Chat.Damage");
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: game.i18n.format(key, { weapon: this.name, target: targetName }),
      flags: {
        modern20: {
          damage: roll.total,
          // Carried so the apply buttons know which pool it belongs in.
          nonlethal: this.isNonlethal(activityId),
          targetName
        }
      }
    });
    return roll;
  }

  /**
   * What this item can do, with availability resolved for its owner. Stored
   * activities win; a weapon without any falls back to the defaults its rate
   * of fire implies.
   */
  get activities() {
    return availableActivities(this);
  }

  /**
   * Does this weapon deal nonlethal damage, for this activity?
   *
   * A sap always does, an activity may override, and beanbag rounds make an
   * otherwise lethal weapon nonlethal: "It deals the same amount of damage as
   * a normal load, but the damage dealt is nonlethal."
   */
  isNonlethal(activityId = "shot") {
    if (this.system.nonlethal) return true;
    // Only a weapon has a magazine, so only a weapon's rounds can change this.
    if (this.type !== "weapon") {
      return Boolean(this.activities.find((entry) => entry.id === activityId)?.damage?.nonlethal);
    }

    const activity = this.activities.find((entry) => entry.id === activityId);
    if (activity?.damage?.nonlethal) return true;

    const loaded = this.actor?.items?.get(this.system.loadedAmmo);
    const special = loaded?.system?.special;
    return Boolean(special && MODERN20.specialAmmunition[special]?.effect?.nonlethal);
  }

  /** Accessories fitted to this item. */
  get accessories() {
    return accessoriesOf(this);
  }

  /**
   * Reload the magazine, drawing on carried ammunition of the same calibre.
   *
   * Reports the action it costs rather than spending it: there is no action
   * economy to deduct from. Partial reloads are allowed — a box with eight
   * rounds left fills eight of a fifteen-round magazine — because refusing
   * would be worse than the SRD, which simply assumes you have rounds.
   */
  /** Carried ammunition this weapon can load, for the sheet to offer. */
  get ammunitionChoices() {
    return carriedAmmunition(this);
  }

  /**
   * Reload the magazine.
   *
   * @param {string} [ammoId] Which carried box to load. Defaults to the
   *   ordinary rounds, so choosing an exotic type is deliberate rather than
   *   whichever the collection happened to yield first.
   */
  async reload(ammoId = "") {
    if (this.type !== "weapon") return null;
    const ammo = this.system.ammo;
    if (!ammo?.max) {
      problem(game.i18n.format("MODERN20.Attack.NoMagazine", { name: this.name }));
      return null;
    }
    if (ammo.value >= ammo.max) {
      acknowledge(game.i18n.format("MODERN20.Attack.AlreadyLoaded", { name: this.name }));
      return null;
    }

    const wanted = ammo.max - ammo.value;
    const box = (ammoId && this.actor?.items?.get(ammoId)) || ammunitionFor(this);

    // A weapon with a calibre needs rounds; one without - a flamethrower, a
    // rocket launcher - has no ammunition entry in the SRD and just refills.
    let loaded = wanted;
    if (this.system.caliber) {
      if (!box) {
        await announce(this.actor, {
          title: game.i18n.format("MODERN20.Attack.NoRounds", {
            name: this.name, caliber: this.system.caliber
          }),
          img: this.img, warning: true
        });
        return null;
      }
      loaded = Math.min(wanted, box.system.quantity);
      await box.update({ "system.quantity": box.system.quantity - loaded });
    }

    await this.update({
      "system.ammo.value": ammo.value + loaded,
      // Remember what is in the magazine, so its effects apply when fired.
      "system.loadedAmmo": box?.id ?? ""
    });

    const action = reloadAction(this);
    // "Reload a firearm with a box magazine or speed loader" is a move action;
    // an internal magazine is a full round. reloadAction works out which.
    await this.actor?.spendAction(action);
    await announce(this.actor, {
      title: game.i18n.format("MODERN20.Attack.Reloaded", {
        name: this.name,
        rounds: ammo.value + loaded,
        max: ammo.max,
        action: game.i18n.localize(`MODERN20.Action.${action}`),
        ammo: box?.name ?? game.i18n.localize("MODERN20.Attack.OrdinaryRounds")
      }),
      img: this.img
    });
    return action;
  }

  /** Buy this item through the owning actor's Wealth bonus. */
  async purchase({ blackMarket = false } = {}) {
    if (!this.actor) throw new Error("Cannot purchase an unowned item");
    if (this.system.purchaseDC === undefined) {
      problem(game.i18n.localize("MODERN20.Warning.NotPurchasable"));
      return null;
    }
    return this.actor.purchase(this.system.purchaseDC, {
      restriction: this.system.restriction,
      blackMarket,
      label: this.name
    });
  }

  async toChat() {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/modern20/templates/chat/item-card.hbs",
      { item: this, system: this.system }
    );
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });
  }
}
