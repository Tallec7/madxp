/**
 * GSD Requirements Commands — requirements parsing, coverage checks
 */

const milestone = require('./lib/milestone.cjs');
const { error } = require('./lib/core.cjs');

function handleRequirementsCommand(args, cwd, raw) {
  const subcommand = args[1];
  if (subcommand === 'mark-complete') {
    milestone.cmdRequirementsMarkComplete(cwd, args.slice(2), raw);
  } else {
    error('Unknown requirements subcommand. Available: mark-complete');
  }
}

module.exports = { handleRequirementsCommand };
