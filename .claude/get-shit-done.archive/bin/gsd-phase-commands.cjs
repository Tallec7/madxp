/**
 * GSD Phase Commands — phase CRUD, phase execution, phase validation
 */

const phase = require('./lib/phase.cjs');
const { error } = require('./lib/core.cjs');

function handlePhaseCommand(args, cwd, raw) {
  const subcommand = args[1];
  if (subcommand === 'next-decimal') {
    phase.cmdPhaseNextDecimal(cwd, args[2], raw);
  } else if (subcommand === 'add') {
    phase.cmdPhaseAdd(cwd, args.slice(2).join(' '), raw);
  } else if (subcommand === 'insert') {
    phase.cmdPhaseInsert(cwd, args[2], args.slice(3).join(' '), raw);
  } else if (subcommand === 'remove') {
    const forceFlag = args.includes('--force');
    phase.cmdPhaseRemove(cwd, args[2], { force: forceFlag }, raw);
  } else if (subcommand === 'complete') {
    phase.cmdPhaseComplete(cwd, args[2], raw);
  } else {
    error('Unknown phase subcommand. Available: next-decimal, add, insert, remove, complete');
  }
}

function handlePhasesCommand(args, cwd, raw) {
  const subcommand = args[1];
  if (subcommand === 'list') {
    const typeIndex = args.indexOf('--type');
    const phaseIndex = args.indexOf('--phase');
    const options = {
      type: typeIndex !== -1 ? args[typeIndex + 1] : null,
      phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
      includeArchived: args.includes('--include-archived'),
    };
    phase.cmdPhasesList(cwd, options, raw);
  } else {
    error('Unknown phases subcommand. Available: list');
  }
}

function handleFindPhase(args, cwd, raw) {
  phase.cmdFindPhase(cwd, args[1], raw);
}

function handlePhasePlanIndex(args, cwd, raw) {
  phase.cmdPhasePlanIndex(cwd, args[1], raw);
}

module.exports = { handlePhaseCommand, handlePhasesCommand, handleFindPhase, handlePhasePlanIndex };
