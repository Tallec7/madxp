/**
 * Commands — Barrel re-export for backwards compatibility
 *
 * Individual modules:
 *   commands-slug.cjs     — slug generation, timestamps
 *   commands-todos.cjs    — todo list/complete
 *   commands-verify.cjs   — path verification, summary extraction
 *   commands-history.cjs  — history digest, progress, stats
 *   commands-git.cjs      — git commit
 *   commands-scaffold.cjs — file scaffolding
 *   commands-web.cjs      — web search (Brave API)
 *   commands-model.cjs    — model resolution
 */
module.exports = {
  ...require('./commands-slug.cjs'),
  ...require('./commands-todos.cjs'),
  ...require('./commands-verify.cjs'),
  ...require('./commands-history.cjs'),
  ...require('./commands-git.cjs'),
  ...require('./commands-scaffold.cjs'),
  ...require('./commands-web.cjs'),
  ...require('./commands-model.cjs'),
};
