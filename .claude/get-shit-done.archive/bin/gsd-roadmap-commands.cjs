/**
 * GSD Roadmap Commands — roadmap creation, milestone management
 */

const roadmap = require('./lib/roadmap.cjs');
const milestone = require('./lib/milestone.cjs');
const { error } = require('./lib/core.cjs');

function handleRoadmapCommand(args, cwd, raw) {
  const subcommand = args[1];
  if (subcommand === 'get-phase') {
    roadmap.cmdRoadmapGetPhase(cwd, args[2], raw);
  } else if (subcommand === 'analyze') {
    roadmap.cmdRoadmapAnalyze(cwd, raw);
  } else if (subcommand === 'update-plan-progress') {
    roadmap.cmdRoadmapUpdatePlanProgress(cwd, args[2], raw);
  } else {
    error('Unknown roadmap subcommand. Available: get-phase, analyze, update-plan-progress');
  }
}

function handleMilestoneCommand(args, cwd, raw) {
  const subcommand = args[1];
  if (subcommand === 'complete') {
    const nameIndex = args.indexOf('--name');
    const archivePhases = args.includes('--archive-phases');
    let milestoneName = null;
    if (nameIndex !== -1) {
      const nameArgs = [];
      for (let i = nameIndex + 1; i < args.length; i++) {
        if (args[i].startsWith('--')) break;
        nameArgs.push(args[i]);
      }
      milestoneName = nameArgs.join(' ') || null;
    }
    milestone.cmdMilestoneComplete(cwd, args[2], { name: milestoneName, archivePhases }, raw);
  } else {
    error('Unknown milestone subcommand. Available: complete');
  }
}

module.exports = { handleRoadmapCommand, handleMilestoneCommand };
