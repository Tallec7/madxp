/**
 * Commands — Model resolution for agent types
 */
const { loadConfig, resolveModelInternal, output, error } = require('./core.cjs');
const { MODEL_PROFILES } = require('./model-profiles.cjs');

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const model = resolveModelInternal(cwd, agentType);

  const agentModels = MODEL_PROFILES[agentType];
  const result = agentModels
    ? { model, profile }
    : { model, profile, unknown_agent: true };
  output(result, raw, model);
}

module.exports = { cmdResolveModel };
