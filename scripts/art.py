#!/usr/bin/env python3
"""Which icon each kind of document gets, and why.

Every document in every pack pointed at one of eleven icons Foundry ships:
180 firearms and 40 suits of body armour were all a picture of a bag, 85
vehicles were a cave, and 300 creatures and 1,969 creature abilities were the
same two grey glyphs. Nothing was broken — a compendium of identical rows is
just unreadable, which for a browser you scroll is the whole of its job.

The icons come from game-icons.net, vendored into `assets/icons` by
`scripts/fetch_art.py` and licensed CC BY 3.0 (see assets/icons/CREDITS.md).
Foundry's own `icons/` are the obvious first choice and are not used here for
one reason: they cannot be checked. There is no Foundry install these scripts
can read, so a core path is a string nobody can verify, and a wrong one renders
as a broken image on documents nobody looks at twice. A vendored file either is
in the repository or is not, and `check_art.py` says which. The modern subject
matter argues the same way: core has no pistol, no police car and no kevlar
vest, and this game is mostly pistols, police cars and kevlar vests.

The choices below are a judgement per group, written here rather than derived,
because "which picture means longarm" is not something the SRD says. What *is*
derived is which group a document belongs to: a field the scrape read, or a
word in the name the SRD printed.

Groups are resolved in order — keyword, then field, then the pack's default —
so the specific beats the general: a shotgun is a shotgun before it is a
longarm, and a longarm before it is a weapon.
"""
from __future__ import annotations

import glob
import os
import re

# The icons, by the slug game-icons.net publishes them under. An author is
# named only where two authors drew the same subject, which `fetch_art.py`
# refuses to guess between.
#
# Kept as one flat table so that the packs below read as choices rather than as
# paths, and so `fetch_art.py` has one list to fetch.

# --- Where a document's group comes from ------------------------------------
#
# Each pack states, in order:
#   "keywords": words in the SRD's own name, first match wins
#   "field":    a dotted path into the document, and a value table
#   "default":  what everything else in the pack gets
#
# A keyword matches on word boundaries against the lowercased name, which is
# why "car" is not a keyword anywhere: "Cargo" and "Scarab" are words too.

PACKS: dict[str, dict] = {

    # ----------------------------------------------------------------- weapons
    # The SRD's weapon categories are about proficiency, not shape, so the
    # category is the floor and the printed name does the real work: the
    # Colt Python, the Mossberg and the M-16 are all "longarm" or "handgun"
    # and none of them look alike.
    "weapons": {
        "keywords": [
            ("shotgun", "shotgun"),
            ("revolver", "skoll/revolver"),
            ("uzi|mac|tec-9|mp5|submachine", "uzi"),
            ("m-16|m16|ak-47|ak47|rifle|carbine|musket", "rifle"),
            ("minigun|machine gun|m-60|m60|m249", "machine-gun"),
            ("grenade", "lorc/grenade"),
            ("rocket|missile|bazooka|law|rpg", "rocket"),
            ("flamethrower|flame", "flamethrower"),
            ("laser|pulse|plasma|blaster|beam", "laser-gun"),
            ("bomb|satchel|dynamite|c4|semtex|det cord|explosive", "cluster-bomb"),
            ("mine|claymore", "land-mine"),
            ("molotov|acid|flare", "fire-bottle"),
            ("pepper spray|mace spray|tear gas", "spray"),
            # The unarmed end of the SRD's simple list, before the whip line
            # can read "Pistol whip" as a whip.
            ("pistol whip|brass knuckle|gauntlet|nekode|fist|punching", "brass-knuckles"),
            ("knife|dagger|bayonet|switchblade|razor|cleaver|shikomi-zue", "lorc/bowie-knife"),
            ("shuriken|dart|throwing star", "thrown-knife"),
            ("sword|katana|rapier|sabre|saber|machete|scimitar|falchion|khopesh"
             "|cutlass|wakizashi|ninja-to|war fan", "broadsword"),
            ("axe|hatchet|waraxe|greataxe|battleaxe|pickaxe|urgosh|pick", "battle-axe"),
            ("maul|warhammer|greatclub|hammer|crowbar|wrench|tool", "claw-hammer"),
            ("mace|morningstar", "flanged-mace"),
            ("flail", "flail"),
            ("scythe|sickle|kama", "scythe"),
            ("halberd|glaive|naginata|guisarme|ranseur|poleaxe|pole|polearm",
             "halberd"),
            ("bow|arrow|crossbow", "crossbow"),
            ("sling|slingshot", "slingshot"),
            ("bolas|lasso", "bolas"),
            ("net", "fishing-net"),
            ("blowgun|speargun|air pistol|paint ball|watergun|flare gun",
             "pistol-gun"),
            ("club|baton|nightstick|staff|nunchaku|tonfa|sap|quarterstaff",
             "skoll/baton"),
            ("spear|javelin|lance|trident|shortspear", "spears"),
            ("whip|chain|garrote|scourge", "crossed-chains"),
            ("taser|stun|shock", "lightning-arc"),
            ("cannon|artillery|turret|gauss|rail", "field-gun"),
        ],
        "field": "system.category",
        "values": {
            # A handgun is the pistol this game is named after; a longarm is
            # the thing it is not.
            "handgun": "pistol-gun",
            "longarm": "rifle",
            "heavy": "machine-gun",
            "explosive": "lorc/grenade",
            # "Archaic" is the SRD's word for everything from a quarterstaff to
            # a katana, and "simple" for a knife or a club.
            "archaic": "broadsword",
            "simple": "lorc/bowie-knife",
        },
        "default": "pistol-gun",
    },

    # ------------------------------------------------------------------- armor
    # Four rows in the SRD's own table, and the only pack where the field says
    # everything the picture needs to.
    "armor": {
        "keywords": [
            ("helmet|helm", "brodie-helmet"),
            ("shield|riot", "american-shield"),
            ("undercover|vest|kevlar", "kevlar-vest"),
            ("leather|jacket", "leather-vest"),
            ("space|void|hazmat|vacuum", "astronaut-helmet"),
        ],
        "field": "system.armorType",
        "values": {
            "light": "kevlar-vest",
            "medium": "armor-vest",
            "heavy": "chest-armor",
            "shield": "american-shield",
        },
        "default": "kevlar-vest",
    },

    # -------------------------------------------------------------------- gear
    # Fifteen equipment categories, which is the one pack where the SRD's own
    # filing is precise enough to picture directly.
    "gear": {
        "keywords": [
            ("first aid|medical|surgery|antitox|pharmac", "first-aid-kit"),
            ("binocular|scope|telescope", "binoculars"),
            ("flashlight|lantern|flare|glow", "flashlight"),
            ("handcuff|manacle", "handcuffs"),
            ("lockpick|pick set|picks", "lockpicks"),
            ("detonator|blasting cap|tripwire", "cluster-bomb"),
            ("sensor|detector|radar|scanner", "radar-sweep"),
            ("suppressor|silencer|holster|scope mount|bipod", "gun-stock"),
            ("laptop|computer|pda", "laptop"),
            ("phone|cell|radio|transmitter|communicator|walkie-talkie",
             "delapouite/smartphone"),
            ("camera|video|film", "photo-camera"),
            ("tent|sleeping|camping", "camping-tent"),
            ("rope|cable|climb|carabiner", "rope-coil"),
            ("toolkit|tool|mechanical|electrical|repair", "toolbox"),
            ("backpack|pack|duffel|bag|case", "backpack"),
            ("battery|power|fuel|cell", "battery-pack"),
            ("mask|respirator|gas", "lorc/gas-mask"),
            ("suit|clothing|outfit|uniform", "shirt"),
            ("ammunition|cartridge|round|magazine|clip", "machine-gun-magazine"),
        ],
        "field": "system.category",
        "values": {
            "Ammunition": "machine-gun-magazine",
            "Clothing": "shirt",
            "Computers and Consumer Electronics": "laptop",
            "Surveillance Gear": "cctv-camera",
            "Survival Gear": "camping-tent",
            "Professional Equipment": "briefcase",
            "Medical Equipment": "first-aid-kit",
            "Electrical Equipment": "toolbox",
            "Mechanical Equipment": "monkey-wrench",
            "Security and Surveillance Gear": "cctv-camera",
            "Miscellaneous Equipment": "backpack",
            # The rest of the scraped categories, which the two catalogues
            # spell their own way.
            "Bags and Boxes": "backpack",
            "Chemical and Medical Equipment": "medical-pack",
            "Computer Equipment": "laptop",
            "Sensor Equipment": "radar-sweep",
            "Sports Equipment": "soccer-ball",
            "Survival Equipment": "camping-tent",
            "Weapon Accessories": "gun-stock",
            # "general" is the services and the lifestyle: a movie ticket, a
            # rented car, a month in a small house. What they have in common is
            # that you buy them and nothing arrives in the character's hands.
            "general": "wallet",
        },
        "default": "backpack",
    },

    # ---------------------------------------------------------------- vehicles
    # No field says what a vehicle is, but the SRD prints it in the name —
    # "Chevrolet Corvette (sports coupe)", "Bell Jet Ranger (helicopter)" —
    # which is the parenthetical this reads.
    "vehicles": {
        "keywords": [
            ("police|patrol car|squad car", "police-car"),
            ("ambulance|paramedic", "ambulance"),
            ("tank|apc|ifv|armored personnel", "battle-tank"),
            ("helicopter|gyrocopter|chopper", "helicopter"),
            ("jet fighter|fighter|interceptor|bomber", "jet-fighter"),
            ("plane|airliner|aircraft|glider|prop", "airplane"),
            ("submarine|sub", "submarine"),
            ("boat|runabout|yacht|cigarette|trawler|dinghy|cruiser", "speed-boat"),
            ("ship|freighter|tanker|carrier|cutter", "cargo-ship"),
            ("spaceship|starship|shuttle|orbital|space", "spaceship"),
            ("hoverboard|hoverbike|jetpack|hover", "jetpack"),
            ("motorcycle|bike|scooter|moped", "cycling"),
            ("truck|pickup|semi|lorry|rig|tractor trailer", "truck"),
            ("bus|coach|transit", "bus"),
            ("suv|hummer|jeep|4x4|off-road|utility", "delapouite/jeep"),
            ("sports coupe|sports car|roadster|convertible", "race-car"),
            ("forklift|bulldozer|crane|construction", "forklift"),
        ],
        # Everything left is a car of some description, which for this game is
        # the right default: the SRD's vehicle chapter opens with sedans.
        "default": "city-car",
    },

    # --------------------------------------------------------------- creatures
    # The SRD's fifteen creature types, which is exactly the axis a GM scans a
    # bestiary along.
    "creatures": {
        "field": "system.details.creatureType",
        "values": {
            "aberration": "floating-tentacles",
            "animal": "wolf-head",
            "construct": "vintage-robot",
            "dragon": "lorc/dragon-head",
            "elemental": "sbed/fire",
            "fey": "lorc/fairy",
            "giant": "giant",
            "humanoid": "person",
            "magicalBeast": "beast-eye",
            "monstrousHumanoid": "horned-helm",
            "ooze": "slime",
            "outsider": "daemon-skull",
            "plant": "carnivorous-plant",
            "undead": "shambling-zombie",
            "vermin": "long-legged-spider",
        },
        "default": "alien-stare",
    },

    # The attacks and abilities a creature carries, which are three quarters of
    # every image in the compendium: 1,969 auras and 504 swords.
    "creatures.items": {
        "keywords": [
            ("claw|talon|rake", "claw"),
            ("bite|fang|jaw", "fangs"),
            ("slam|fist|punch|buffet", "punch"),
            ("gore|horn|butt", "bull-horns"),
            ("sting|stinger", "wasp-sting"),
            ("tail|slap", "spiked-tail"),
            ("tentacle|pseudopod|arm", "suckered-tentacle"),
            ("breath", "dragon-breath"),
            ("gaze|stare|eye", "all-seeing-eye"),
            ("web", "spider-web"),
            ("poison|venom|toxic", "poison-bottle"),
            ("disease|rot|filth", "vomiting"),
            ("spell|magic|arcane", "magic-swirl"),
            ("psionic|telepath|mind", "telepathy"),
            ("fire|flame|burn", "flame"),
            ("cold|ice|frost", "ice-spear"),
            ("acid", "acid"),
            ("electric|shock|lightning", "lightning-arc"),
            ("sonic|scream|shriek|wail", "sonic-shout"),
            ("regenerat|heal|fast healing", "healing"),
            ("immun|resist|reduction", "shield-reflect"),
            ("darkvision|low-light|sight|scent|sense|blind", "third-eye"),
            ("fear|frighten|terror", "terror"),
            ("grab|grapple|constrict|improved grab", "grab"),
            ("pounce|charge|trample|rush", "charging-bull"),
            ("swallow", "swallower"),
            ("invisib|hide|stealth|camouflage", "invisible"),
            ("fly|flight|wing", "feathered-wing"),
            ("burrow|earth", "dig-hole"),
            ("swim|water|aquatic", "lorc/splash"),
        ],
        # An ability the SRD prints no keyword for is still one of three kinds,
        # which is the distinction the sheet already shows as a tag — and
        # failing that, it is one of the three things a creature carries: an
        # attack, a feat, or an ability with no type printed.
        "fields": [
            ("system.abilityType", {
                "extraordinary": "aura",
                "supernatural": "magic-swirl",
                "spellLike": "scroll-unfurled",
            }),
            ("type", {
                # A natural weapon whose name this does not recognise.
                "weapon": "claws",
                # 775 of these: a creature's feats are feats.
                "feat": "muscle-up",
                "specialAbility": "aura",
            }),
        ],
        "default": "aura",
    },

    # ------------------------------------------------------------------ spells
    # The eight schools, which is how every spell list in print is organised.
    # The SRD writes a subschool in the same field — "Conjuration (Healing)" —
    # so the value table is matched on the leading word.
    "spells": {
        "field": "system.school",
        "prefix": True,
        "values": {
            "Abjuration": "magic-shield",
            "Conjuration": "magic-portal",
            "Divination": "crystal-ball",
            "Enchantment": "magic-swirl",
            "Evocation": "lightning-arc",
            "Illusion": "floating-ghost",
            "Necromancy": "burning-skull",
            "Transmutation": "transform",
        },
        "default": "scroll-unfurled",
    },

    # --------------------------------------------------------------- psionics
    # The SRD gives a power no school, so the display it makes — what the table
    # sees when somebody uses it — is the closest thing to a category.
    "psionics": {
        "field": "system.display",
        "prefix": True,
        "values": {
            "Visual": "third-eye",
            "Audible": "psychic-waves",
            "Mental": "brain",
            "Material": "magic-palm",
            "Olfactory": "nose-side",
        },
        "default": "brain",
    },

    # --------------------------------------------------------------------- fx
    # The eleven categories of FX item, which are the book's own shelves.
    "fx": {
        "field": "system.category",
        "values": {
            "Armor": "chest-armor",
            "Artifacts": "glowing-artifact",
            "Potions": "magic-potion",
            "Rings": "diamond-ring",
            "Rods": "orb-wand",
            "Scrolls": "tied-scroll",
            "Staffs": "crystal-wand",
            "Tattoos": "pierced-body",
            "Vehicular": "car-key",
            "Wands": "fairy-wand",
            "Weapons": "energy-sword",
            "Wondrous": "magic-swirl",
        },
        "default": "magic-swirl",
    },

    # ---------------------------------------------------- what a character is
    # The six basic classes are the six ability scores, which is the one thing
    # the SRD does say: "the Strong hero", "the Smart hero".
    "classes": {
        "field": "system.keyAbility",
        "values": {
            "str": "muscle-up",
            "dex": "dodge",
            "con": "heart-plus",
            "int": "brain",
            "wis": "third-eye",
            "cha": "graduate-cap",
        },
        "default": "trophy",
    },

    # A talent belongs to a tree, and a tree to one of the six classes, so a
    # talent is pictured by the class that grants it.
    "talents": {
        "field": "system.sourceClass",
        "values": {
            "Strong Hero": "muscle-up",
            "Fast Hero": "dodge",
            "Tough Hero": "heart-plus",
            "Smart Hero": "brain",
            "Dedicated Hero": "third-eye",
            "Charismatic Hero": "graduate-cap",
        },
        "default": "trophy",
    },

    # Feats are abstract and the SRD types them all "general"; the only axis it
    # prints is the bracketed category on a handful from Urban Arcana.
    "feats": {
        "field": "system.category",
        "values": {
            "Metamagic": "magic-swirl",
            "Metapsionic": "telepathy",
            "Initial": "trophy",
        },
        "default": "muscle-up",
    },

    # An occupation is what the character did before the campaign started.
    "occupations": {
        "keywords": [
            ("academic|student|scholar", "graduate-cap"),
            ("athlete|military|soldier", "muscle-up"),
            ("criminal|gangster", "handcuffs"),
            ("doctor|emergency|medical", "first-aid-kit"),
            ("investigative|detective|law enforcement", "police-badge"),
            ("technician|engineer|mechanic", "toolbox"),
            ("pilot|transport|astronaut", "airplane"),
            ("religious|acolyte", "crystal-shrine"),
            ("white collar|entrepreneur|professional|adventurer", "briefcase"),
        ],
        "default": "briefcase",
    },

    # ----------------------------------------------------------------- objects
    # Fourteen things with a hardness and a break DC: what the rules let a
    # character smash, pick or cut through.
    "objects": {
        "keywords": [
            ("door", "door"),
            ("wall|cinderblock", "brick-wall"),
            ("bars", "window-bars"),
            ("lock", "cog-lock"),
            ("chain", "crossed-chains"),
            ("rope", "rope-coil"),
            ("handcuff", "handcuffs"),
            ("firearm|gun", "pistol-gun"),
        ],
        "default": "stone-block",
    },

    # The six ready-made characters, pictured by what they did before the
    # campaign started — which is the one thing about a person a starting
    # occupation actually states.
    "pregens": {
        "field": "system.details.occupation",
        "values": {
            "Military": "muscle-up",
            "Criminal": "handcuffs",
            "Emergency Services": "first-aid-kit",
            "Doctor": "medical-pack",
            "Technician": "toolbox",
            "Investigative": "police-badge",
        },
        "default": "person",
    },

    # A table is a thing you roll on.
    "tables": {"default": "perspective-dice-six-faces-random"},
}


# The eleven icons every document used to carry, and the only images this is
# allowed to replace. Anything else in an `img` field was chosen by somebody,
# and a choice is not a placeholder.
PLACEHOLDERS = frozenset({
    "icons/svg/aura.svg",
    "icons/svg/book.svg",
    "icons/svg/cave.svg",
    "icons/svg/daze.svg",
    "icons/svg/door-closed.svg",
    "icons/svg/item-bag.svg",
    "icons/svg/mystery-man.svg",
    "icons/svg/statue.svg",
    "icons/svg/sword.svg",
    "icons/svg/upgrade.svg",
    "icons/svg/village.svg",
})

# Where a vendored icon lives, as Foundry addresses it: relative to the data
# directory, which is where a system's own files are served from.
PREFIX = "systems/modern20/assets/icons/"

# The same drawing again, as a disc, for the canvas. An actor that states no
# token artwork gets Foundry's CONST.DEFAULT_TOKEN — "icons/svg/mystery-man.svg"
# — so all 399 of them dropped onto a map as the same grey silhouette however
# well the sheet was illustrated. A square tile is right in a list and wrong on
# a battlemap, where a token is read as a figure standing on a square of
# ground, so the token variants are cut as circles.
TOKEN_PREFIX = "systems/modern20/assets/tokens/"

# The packs whose documents are actors, and so the packs that need tokens.
ACTOR_PACKS = frozenset({"creatures", "vehicles", "objects", "pregens"})

# How the token draws its artwork, beyond which file to use.
#
# A drawing that exactly fills its square still reads small on a map, where a
# token is looked at for a moment at whatever zoom the scene is at, so the art
# is drawn at twice the token and anchored a quarter down — a figure standing
# on its square rather than contained by it. Terry set these on the live packs
# by hand; they are here so that the import agrees, because the reconciler
# takes the whole prototype token from the import and would otherwise strip
# them from all 399 documents on its next run.
#
# One number for every size, which is the simple choice and not the only one:
# it means a Colossal creature's six-square token draws twelve squares of art.
# If that reads badly next to a Medium one, this is where it changes.
TOKEN_TEXTURE = {"scaleX": 2, "scaleY": 2, "anchorX": 0.5, "anchorY": 0.25}

# The directory `fetch_art.py` fills, which is also the record of who drew
# what: an icon is filed under its author, because that is what CC BY asks to
# be kept.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets", "icons")
TOKENS = os.path.join(ROOT, "assets", "tokens")

_FILES: dict[str, dict[str, list[str]]] = {}


def vendored(directory: str = "") -> dict[str, list[str]]:
    """What is actually in an asset directory: slug -> the paths that drew it.

    Read from the directory rather than from a generated list, so the answer
    to "is this icon here" is the filesystem's and cannot drift from it.
    """
    directory = directory or ASSETS
    if directory not in _FILES:
        found: dict[str, list[str]] = {}
        for path in sorted(glob.glob(os.path.join(directory, "*", "*.svg"))):
            author = os.path.basename(os.path.dirname(path))
            slug = os.path.basename(path)[:-4]
            found.setdefault(slug, []).append(f"{author}/{slug}.svg")
        _FILES[directory] = found
    return _FILES[directory]


def resolve(icon: str, directory: str = "") -> str | None:
    """An icon the map names, as the file it is — or None where it is not here.

    The map names a bare slug where one author drew the subject and
    `author/slug` where two did. Nothing ever returns a path that is not on
    disk: a missing file means `fetch_art.py` has not been run, and a document
    is better left with the icon it has than given a broken one.
    """
    files = vendored(directory)
    if "/" in icon:
        return icon + ".svg" if icon + ".svg" in files.get(icon.split("/")[1], []) else None
    drawn = files.get(icon) or []
    return drawn[0] if len(drawn) == 1 else None


def icons() -> set[str]:
    """Every icon slug the map names, which is what there is to fetch."""
    wanted: set[str] = set()
    for group in PACKS.values():
        for _pattern, icon in group.get("keywords") or []:
            wanted.add(icon)
        wanted.update((group.get("values") or {}).values())
        for _field, values in group.get("fields") or []:
            wanted.update(values.values())
        if group.get("default"):
            wanted.add(group["default"])
    return wanted


def _path(icon: str) -> str | None:
    """An icon the map names, as an `img` field."""
    found = resolve(icon)
    return PREFIX + found if found else None


def token_icons() -> set[str]:
    """The icons an actor can be pictured by, and so the discs to cut.

    Only the actor packs: a feat needs no token, and cutting 163 discs to use
    35 of them is 300 KB of the repository nothing points at.
    """
    wanted: set[str] = set()
    for pack, group in PACKS.items():
        # The pack itself, not what its documents carry: a creature's abilities
        # are items on an actor and never stand on a map themselves.
        if pack not in ACTOR_PACKS:
            continue
        for _pattern, icon in group.get("keywords") or []:
            wanted.add(icon)
        wanted.update((group.get("values") or {}).values())
        for _field, values in group.get("fields") or []:
            wanted.update(values.values())
        if group.get("default"):
            wanted.add(group["default"])
    return wanted


def token_for(pack: str, document: dict) -> str | None:
    """The token artwork for an actor: the same drawing, cut as a disc."""
    if pack not in ACTOR_PACKS:
        return None
    icon = icon_for(pack, document)
    if not icon:
        return None
    found = resolve(icon[len(PREFIX):-4], TOKENS)
    return TOKEN_PREFIX + found if found else None


def _read(document: dict, path: str):
    """A dotted path into a document: "system.details.creatureType"."""
    value = document
    for step in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(step)
    return value


# A keyword matches a whole word, so "car" cannot match "Cargo" — which is why
# the vehicle keywords spell out "sports coupe" rather than trusting "car". A
# trailing "s" is allowed, because the SRD names things in both numbers:
# "Handcuffs", "Lockpicks", "Claw (x2)" and "Claws" are the same keyword.
_WORD = {}


def _matches(pattern: str, name: str) -> bool:
    compiled = _WORD.get(pattern)
    if compiled is None:
        compiled = _WORD[pattern] = re.compile(
            r"(?<![a-z])(?:" + pattern + r")s?(?![a-z])", re.I)
    return bool(compiled.search(name))


def icon_for(pack: str, document: dict, *, embedded: bool = False) -> str | None:
    """The icon this document gets, as an `img` path, or None for no rule.

    `embedded` picks the rules for what a document carries rather than for the
    document itself: a creature is pictured by its type, and the abilities on
    it by what each one does.
    """
    group = PACKS.get(f"{pack}.items" if embedded else pack)
    if not group:
        return None

    name = str(document.get("name") or "")
    for pattern, icon in group.get("keywords") or []:
        if _matches(pattern, name):
            return _path(icon)

    # One field table, or several tried in order where one field does not
    # answer for every document: a creature's abilities say what kind of
    # ability they are, and the ones that do not are still a feat or an attack.
    tables = list(group.get("fields") or [])
    if group.get("field"):
        tables.append((group["field"], group.get("values") or {}))
    for field, values in tables:
        value = _read(document, field)
        if not isinstance(value, str) or not value:
            continue
        if value in values:
            return _path(values[value])
        # "Conjuration (Healing)" is a Conjuration spell, and the SRD writes a
        # display as "Visual, Material".
        if group.get("prefix"):
            head = re.split(r"[(,;]", value)[0].strip()
            if head in values:
                return _path(values[head])

    default = group.get("default")
    return _path(default) if default else None
