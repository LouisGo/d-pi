// Small follow-up using the existing isolated runtime/localhost harness.
module.exports = async ({ check, start, requests, binary, project, env, execFileSync, assert }) => {
  const cli = (...args) => JSON.parse(execFileSync(binary, ['config', ...args, '--json'], { cwd: project, env: env(), stdio: ['pipe', 'pipe', 'pipe'] }).toString());
  const host = await start('Settings');
  const child = async (extra = '') => {
    const from = requests.length;
    const frames = await host.turn(`PROBE_CONFIG_CHILD ${extra}`);
    const result = frames.find(f => f.type === 'tool_execution_end' && f.toolName === 'task')?.result?.details?.results?.[0];
    assert(result, 'Missing child result'); assert.equal(result.exitCode, 0);
    return { model: result.resolvedModelIdentity, thinking: result.resolvedThinkingLevel, modelRequests: requests.slice(from).map(r => ({ model: r.model, effort: r.effort })) };
  };
  await check('native_settings_catalog_and_model_choices', async () => {
    const list = cli('list');
    const sample = Object.fromEntries(['task.agentModelOverrides', 'task.enableEffort', 'task.maxConcurrency', 'defaultThinkingLevel', 'memory.backend'].map(k => [k, list[k]]));
    for (const value of Object.values(sample)) { assert(value); assert('value' in value); assert(value.type); }
    const models = await host.send('get_available_models');
    const levels = await host.send('get_available_thinking_levels');
    assert.equal(models.success, true); assert.equal(levels.success, true);
    assert(models.data.models.some(m => m.id === 'alternate'));
    return { settingCount: Object.keys(list).length, sample, modelIds: models.data.models.map(m => `${m.provider}/${m.id}`), currentModelLevels: levels.data, note: 'Catalog has values/types/descriptions; inspect sample for absent enums/defaults/groups.' };
  });
  await check('child_uses_agent_definition_before_override', async () => {
    const result = await child(); assert.equal(result.model, 'probe/probe'); assert.equal(result.thinking, 'low');
    return result;
  });
  await check('native_config_write_applies_to_next_spawn_in_same_main_process', async () => {
    const before = cli('get', 'task.agentModelOverrides').value;
    cli('set', 'task.agentModelOverrides', JSON.stringify({ ...before, 'probe-low': 'probe/alternate:high' }));
    const result = await child();
    assert.equal(result.model, 'probe/alternate'); assert.equal(result.thinking, 'high');
    assert(result.modelRequests.some(r => r.model === 'alternate'));
    return { saved: cli('get', 'task.agentModelOverrides').value, mainPid: host.child.pid, child: result, effect: 'Next spawn; same running main process, no restart or RPC reload.' };
  });
  await check('explicit_task_effort_overrides_configured_thinking', async () => {
    const result = await child('EXPLICIT_EFFORT');
    assert.equal(result.model, 'probe/alternate'); assert.equal(result.thinking, 'minimal');
    return { child: result, note: 'task.enableEffort=true allows the main agent to supply lo/med/hi; lo overrides configured high.' };
  });
  await check('native_reset_restores_agent_default_for_next_spawn', async () => {
    cli('reset', 'task.agentModelOverrides');
    const result = await child(); assert.equal(result.model, 'probe/probe'); assert.equal(result.thinking, 'low');
    return { overrides: cli('get', 'task.agentModelOverrides').value, child: result };
  });
  await check('native_enum_validation_rejects_invalid_setting', async () => {
    const before = cli('get', 'defaultThinkingLevel').value;
    let rejected = false, error = '';
    try { cli('set', 'defaultThinkingLevel', 'not-a-level'); }
    catch (e) { rejected = true; error = String(e.stderr || e.message).slice(0, 600); }
    assert(rejected); assert.equal(cli('get', 'defaultThinkingLevel').value, before);
    return { rejected, previousValuePreserved: true, error };
  });
};
