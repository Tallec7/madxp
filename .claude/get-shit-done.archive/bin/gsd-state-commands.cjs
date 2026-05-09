/**
 * GSD State Commands — state read/write, status checks, progress tracking
 */

const state = require('./lib/state.cjs');

function handleStateCommand(args, cwd, raw) {
  const subcommand = args[1];
  if (subcommand === 'json') {
    state.cmdStateJson(cwd, raw);
  } else if (subcommand === 'update') {
    state.cmdStateUpdate(cwd, args[2], args[3]);
  } else if (subcommand === 'get') {
    state.cmdStateGet(cwd, args[2], raw);
  } else if (subcommand === 'patch') {
    const patches = {};
    for (let i = 2; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1];
      if (key && value !== undefined) {
        patches[key] = value;
      }
    }
    state.cmdStatePatch(cwd, patches, raw);
  } else if (subcommand === 'advance-plan') {
    state.cmdStateAdvancePlan(cwd, raw);
  } else if (subcommand === 'record-metric') {
    const phaseIdx = args.indexOf('--phase');
    const planIdx = args.indexOf('--plan');
    const durationIdx = args.indexOf('--duration');
    const tasksIdx = args.indexOf('--tasks');
    const filesIdx = args.indexOf('--files');
    state.cmdStateRecordMetric(cwd, {
      phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
      plan: planIdx !== -1 ? args[planIdx + 1] : null,
      duration: durationIdx !== -1 ? args[durationIdx + 1] : null,
      tasks: tasksIdx !== -1 ? args[tasksIdx + 1] : null,
      files: filesIdx !== -1 ? args[filesIdx + 1] : null,
    }, raw);
  } else if (subcommand === 'update-progress') {
    state.cmdStateUpdateProgress(cwd, raw);
  } else if (subcommand === 'add-decision') {
    const phaseIdx = args.indexOf('--phase');
    const summaryIdx = args.indexOf('--summary');
    const summaryFileIdx = args.indexOf('--summary-file');
    const rationaleIdx = args.indexOf('--rationale');
    const rationaleFileIdx = args.indexOf('--rationale-file');
    state.cmdStateAddDecision(cwd, {
      phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
      summary: summaryIdx !== -1 ? args[summaryIdx + 1] : null,
      summary_file: summaryFileIdx !== -1 ? args[summaryFileIdx + 1] : null,
      rationale: rationaleIdx !== -1 ? args[rationaleIdx + 1] : '',
      rationale_file: rationaleFileIdx !== -1 ? args[rationaleFileIdx + 1] : null,
    }, raw);
  } else if (subcommand === 'add-blocker') {
    const textIdx = args.indexOf('--text');
    const textFileIdx = args.indexOf('--text-file');
    state.cmdStateAddBlocker(cwd, {
      text: textIdx !== -1 ? args[textIdx + 1] : null,
      text_file: textFileIdx !== -1 ? args[textFileIdx + 1] : null,
    }, raw);
  } else if (subcommand === 'resolve-blocker') {
    const textIdx = args.indexOf('--text');
    state.cmdStateResolveBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
  } else if (subcommand === 'record-session') {
    const stoppedIdx = args.indexOf('--stopped-at');
    const resumeIdx = args.indexOf('--resume-file');
    state.cmdStateRecordSession(cwd, {
      stopped_at: stoppedIdx !== -1 ? args[stoppedIdx + 1] : null,
      resume_file: resumeIdx !== -1 ? args[resumeIdx + 1] : 'None',
    }, raw);
  } else {
    state.cmdStateLoad(cwd, raw);
  }
}

function handleStateSnapshot(cwd, raw) {
  state.cmdStateSnapshot(cwd, raw);
}

module.exports = { handleStateCommand, handleStateSnapshot };
