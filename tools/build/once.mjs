/**
 * A builder that runs once per process. Importers resolve their links through
 * each other (classes need the feats, creatures the talents and creature
 * types), so without this one build of every pack, or one test run, rebuilt the
 * feats pack many times over. The SRD cannot change while a process runs, so
 * the first result is the result. Treat what it returns as read-only.
 */
export function once(build) {
  let result;
  let done = false;
  return () => {
    if (!done) { result = build(); done = true; }
    return result;
  };
}
