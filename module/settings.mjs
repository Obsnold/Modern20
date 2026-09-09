const SYSTEM_ID = "modern20";

/**
 * The decisions this system makes that a table might want made differently.
 *
 * Every entry here was previously frozen in code. The rule for what belongs:
 * a setting exists where the SRD leaves room, where a table commonly houses
 * a rule, or where the choice is about how the software behaves rather than
 * what the rules say. Anything the SRD states plainly and unconditionally is
 * not a setting — a critical is still two damage rolls.
 *
 * Defaults reproduce the SRD, and the behaviour this system already had, so
 * an existing world plays exactly as it did before these existed.
 */
export const SETTINGS = {
  /** "it must succeed on a Fortitude save (DC 15) or immediately drop to -1" */
  massiveDamage: {
    scope: "world", config: true, type: Boolean, default: true
  },
  massiveDamageDC: {
    scope: "world", config: true, type: Number, default: 15,
    range: { min: 5, max: 40, step: 1 }
  },

  /**
   * Whether running out of actions stops you.
   *
   * Warning is the default because the SRD leaves five actions as "varies"
   * and a table routinely does things the rules do not name — but a GM who
   * wants the budget to mean something can have it.
   */
  actionBudget: {
    scope: "world", config: true, type: String, default: "warn",
    choices: {
      warn: "MODERN20.Settings.actionBudget.warn",
      block: "MODERN20.Settings.actionBudget.block",
      off: "MODERN20.Settings.actionBudget.off"
    }
  },

  /** "before the character's first turn in the initiative order" */
  autoFlatFooted: {
    scope: "world", config: true, type: Boolean, default: true
  },

  /** Refill the action budget as each combatant's turn comes round. */
  autoTurnReset: {
    scope: "world", config: true, type: Boolean, default: true
  },

  /**
   * Whether players may edit their own sheets outside the creator and the
   * level-up screen. Locked by default: those screens apply the rules, and
   * editing the same values directly bypasses them.
   */
  lockPlayerSheets: {
    scope: "world", config: true, type: Boolean, default: true
  },

  /** Whether a heavy load actually slows a character down. */
  encumbranceSpeed: {
    scope: "world", config: true, type: Boolean, default: true
  },

  /** The die an action point adds. The SRD's is 1d6. */
  actionPointDie: {
    scope: "world", config: true, type: String, default: "1d6"
  },

  /**
   * When to ask about circumstance modifiers before an attack.
   *
   * Client-scoped: it is a preference about how you like to roll, not a rule,
   * so two players at the same table can differ.
   */
  attackDialog: {
    scope: "client", config: true, type: String, default: "always",
    choices: {
      always: "MODERN20.Settings.attackDialog.always",
      shift: "MODERN20.Settings.attackDialog.shift",
      never: "MODERN20.Settings.attackDialog.never"
    }
  }
};

/** Register every setting, with its name and hint from the language file. */
export function registerSettings() {
  for (const [key, definition] of Object.entries(SETTINGS)) {
    game.settings.register(SYSTEM_ID, key, {
      name: `MODERN20.Settings.${key}.name`,
      hint: `MODERN20.Settings.${key}.hint`,
      ...definition
    });
  }
}

/**
 * Read a setting, falling back to its default.
 *
 * Data preparation can run before settings are registered — a compendium
 * document prepared during init, for one — and `game.settings.get` throws on
 * an unregistered key rather than returning anything. Falling back keeps
 * preparation working instead of failing the world load.
 */
export function setting(key) {
  try {
    return game.settings.get(SYSTEM_ID, key);
  } catch {
    return SETTINGS[key]?.default;
  }
}
