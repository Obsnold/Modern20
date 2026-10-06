/**
 * Loaded before Foundry's server when it runs under the desktop app's bundled Node
 * (ELECTRON_RUN_AS_NODE): Foundry takes any process reporting an Electron version for the
 * desktop app and opens a window. Without it, Foundry runs as a plain Node server.
 */
delete process.versions.electron;
