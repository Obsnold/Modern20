/**
 * The bits of Node the tools use, declared as `any` on purpose.
 *
 * The same bargain as types/foundry.d.ts, for the same reason. `tsc` cannot
 * resolve `node:fs` without @types/node, and @types/node is megabytes of
 * declarations for an API nothing here is trying to verify — the tools read
 * files and exit; what is worth checking is what they read those files to say
 * about the system.
 *
 * So: no dependency, and seven names rather than a wildcard, because the list
 * is then also the truth about how much of Node this repository touches. An
 * eighth import fails to compile, which is the moment to decide whether it
 * belongs here.
 */

declare module "node:fs" {
  export const readFileSync: any;
  export const readdirSync: any;
  export const statSync: any;
}

declare module "node:path" {
  export const join: any;
  export const relative: any;
}

declare module "node:url" {
  export const fileURLToPath: any;
}

declare module "node:module" {
  export const createRequire: any;
}

declare var process: any;
