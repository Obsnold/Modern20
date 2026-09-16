/**
 * The Foundry globals, declared as `any` on purpose.
 *
 * Foundry ships no types, and the community packages that do are large,
 * version-skewed and would need pinning to the exact core release this system
 * is verified against. Declaring the six globals means `tsc --checkJs` stops
 * reporting them as undefined names — which check_globals.py already covers,
 * and better, since it knows which ones v14 removed — and gets on with the
 * job it is here for: the system's own code checking itself.
 *
 * The consequence is honest and worth stating: anything reached through
 * `foundry.*`, `game.*` or a document instance is unchecked. What is checked
 * is everything this repository wrote.
 */

declare var foundry: any;
declare var game: any;
declare var canvas: any;
declare var ui: any;
declare var CONFIG: any;
declare var CONST: any;
declare var Hooks: any;
declare var Handlebars: any;
