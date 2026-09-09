import { MODERN20 } from "../config.mjs";

const { ChatMessage } = foundry.documents;

/**
 * Applying damage and healing.
 *
 * Health changes through actions rather than by typing a number: a damage roll
 * offers to apply itself, and the sheet offers adjustment steps. Both route
 * through Actor#applyDamage, so damage reduction and the massive damage
 * Fortitude save happen wherever the damage came from.
 */

/** Tokens the user is targeting, or has selected, or the actor they own. */
export function damageRecipients() {
  const targeted = [...(game.user.targets ?? [])].map((token) => token.actor);
  if (targeted.length) return targeted.filter(Boolean);

  const controlled = (canvas?.tokens?.controlled ?? []).map((token) => token.actor);
  if (controlled.length) return controlled.filter(Boolean);

  return game.user.character ? [game.user.character] : [];
}

/**
 * Apply an amount to every recipient. A negative amount heals.
 *
 * Healing is a plain hit point restore rather than a call to applyDamage,
 * which would run damage reduction and the massive damage save against it.
 */
export async function applyAmount(amount, { multiplier = 1 } = {}) {
  const recipients = damageRecipients();
  if (!recipients.length) {
    ui.notifications.warn(game.i18n.localize("MODERN20.Damage.NoTarget"));
    return [];
  }

  const scaled = Math.floor(amount * multiplier);
  const applied = [];

  for (const actor of recipients) {
    if (!actor.isOwner) {
      ui.notifications.warn(game.i18n.format("MODERN20.Damage.NotYours", { name: actor.name }));
      continue;
    }
    const hp = actor.system.hp;
    if (!hp) continue;

    if (scaled >= 0) {
      await actor.applyDamage(scaled);
    } else {
      const healed = Math.min(hp.max, hp.value - scaled);
      await actor.update({ "system.hp.value": healed });
    }
    applied.push(actor.name);
  }

  if (applied.length) {
    ui.notifications.info(game.i18n.format(
      scaled >= 0 ? "MODERN20.Damage.Applied" : "MODERN20.Damage.Healed",
      { amount: Math.abs(scaled), names: applied.join(", ") }
    ));
  }
  return applied;
}

/**
 * Add apply controls to a damage message.
 *
 * Bound on renderChatMessageHTML, which since v13 passes an HTMLElement rather
 * than jQuery.
 */
export function bindDamageControls(message, html) {
  bindAttackDamage(message, html);

  const total = message.getFlag("modern20", "damage");
  if (total === undefined) return;

  const buttons = document.createElement("div");
  buttons.className = "m20-damage-buttons";
  buttons.innerHTML = `
    <button type="button" data-m20-apply="1">${game.i18n.localize("MODERN20.Damage.Apply")}</button>
    <button type="button" data-m20-apply="0.5">${game.i18n.localize("MODERN20.Damage.Half")}</button>
    <button type="button" data-m20-apply="-1">${game.i18n.localize("MODERN20.Damage.Heal")}</button>
  `;

  for (const button of buttons.querySelectorAll("[data-m20-apply]")) {
    button.addEventListener("click", () => {
      applyAmount(total, { multiplier: Number(button.dataset.m20Apply) });
    });
  }

  (html.querySelector(".message-content") ?? html).append(buttons);
}

/**
 * Bind the damage buttons on an attack card.
 *
 * The card knows which weapon it came from and whether the threat confirmed,
 * so damage is rolled from the item rather than re-derived here.
 */
function bindAttackDamage(message, html) {
  const attack = message.getFlag("modern20", "attack");
  if (!attack) return;

  bindSelectTarget(html, attack);

  for (const button of html.querySelectorAll("[data-m20-damage]")) {
    button.addEventListener("click", async () => {
      const actor = ChatMessage.getSpeakerActor(message.speaker);
      const item = actor?.items?.get(attack.itemId);
      if (!item) {
        ui.notifications.warn(game.i18n.localize("MODERN20.Attack.ItemGone"));
        return;
      }
      await item.rollDamage({
        critical: button.dataset.m20Damage === "critical",
        activityId: attack.activityId ?? "shot"
      });
    });
  }
}

/**
 * Select and pan to the token an attack was made against.
 *
 * Closes the loop between "this hit the Bugbear" and applying damage to it,
 * which otherwise means finding the token on the canvas by eye. PF2e users
 * install a module for this; it is small enough to just have.
 */
function bindSelectTarget(html, attack) {
  const link = html.querySelector("[data-m20-select-target]");
  if (!link || !attack.targetTokenId) return;

  link.addEventListener("click", async () => {
    // The attack may have happened on a scene the viewer is no longer on.
    if (attack.targetSceneId && canvas.scene?.id !== attack.targetSceneId) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Attack.TargetElsewhere"));
      return;
    }

    const token = canvas.tokens?.get(attack.targetTokenId);
    if (!token) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Attack.TargetGone"));
      return;
    }

    token.control({ releaseOthers: true });
    await canvas.animatePan({ x: token.center.x, y: token.center.y });
  });
}