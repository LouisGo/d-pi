// OMP 18.3.0 capability probe. Real runtime, deterministic localhost model, no provider credentials.
// Usage: node probe.cjs /absolute/path/to/omp [result.json] [core|settings]
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const readline = require('node:readline');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const binary = path.resolve(process.argv[2]);
const output = process.argv[3] || path.join(__dirname, 'result.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd-pi-feasibility-'));
const config = path.join(root, 'config');
const project = path.join(root, 'project');
fs.mkdirSync(config); fs.mkdirSync(project);
const clients = [], checks = [], requests = [];
let inFlight = 0, peakInFlight = 0, routeThread;
const marker = 'DPI_MEMORY_CANARY_73921';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(predicate, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = predicate(); if (value) return value; await sleep(20); }
  throw Error(`Timeout: ${label}`);
}
async function check(name, fn) {
  try { const evidence = await fn(); checks.push({ name, passed: true, evidence }); console.log('PASS', name); }
  catch (e) { checks.push({ name, passed: false, error: e.message }); console.log('FAIL', name, e.message); }
}
function sse(res, text, calls) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const frame = (delta, finish_reason) => ({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'probe', choices: [{ index: 0, delta, finish_reason }] });
  const delta = calls ? { role: 'assistant', tool_calls: calls.map((c, index) => ({ index, id: `call_${index}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : { role: 'assistant', content: text };
  res.write(`data: ${JSON.stringify(frame(delta, null))}\n\n`);
  res.write(`data: ${JSON.stringify(frame({}, calls ? 'tool_calls' : 'stop'))}\n\n`);
  res.end('data: [DONE]\n\n');
}
const server = http.createServer(async (req, res) => {
  inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const messages = body.messages || [];
    const last = messages.at(-1);
    const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content);
    requests.push({ model: body.model, effort: body.reasoning_effort, users: messages.filter(m => m.role === 'user').map(m => m.content), memoryInSystem: messages.some(m => ['system', 'developer'].includes(m.role) && JSON.stringify(m.content).includes(marker)), tools: (body.tools || []).map(t => t.function?.name), at: Date.now() });
    if (last?.role === 'user' && text.includes('PROBE_CONFIG_CHILD')) {
      const item = { name: 'ConfiguredChild', agent: 'probe-low', task: 'CHILD_CONFIG: reply READY, no tools.' };
      if (text.includes('EXPLICIT_EFFORT')) item.effort = 'lo';
      sse(res, '', [{ name: 'task', args: { context: 'Isolated settings test.', tasks: [item] } }]);
    } else if (last?.role === 'user' && text.includes('PROBE_SPAWN')) {
      sse(res, '', [{ name: 'task', args: { context: 'Isolated capability test. Do not use any tools.', tasks: [
        { name: 'ProbeLow', agent: 'probe-low', task: 'CHILD_LOW: reply READY, no tools.', effort: 'lo' },
        { name: 'ProbeHigh', agent: 'probe-high', task: 'CHILD_HIGH: reply READY, no tools.', effort: 'hi' }
      ] } }]);
    } else if (last?.role === 'user' && text.includes('PROBE_LEARN')) {
      sse(res, '', [{ name: 'learn', args: { memory: `For this disposable project, use ${marker} as its test convention.` } }]);
    } else if (last?.role === 'user' && text.includes('PROBE_HOST')) {
      sse(res, '', [{ name: 'gui_echo', args: { value: 'host-roundtrip' } }]);
    } else if (last?.role === 'user' && text.includes('PROBE_ROUTE')) {
      sse(res, '', [{ name: 'gui_send_to_thread', args: { message: 'FROM_A_TO_B_CANARY' } }]);
    } else {
      if (text?.includes('CHILD_') || text?.includes('PROBE_CONCURRENT')) await sleep(350);
      sse(res, 'FIXTURE_OK');
    }
  } catch (e) { res.writeHead(500); res.end(e.message); }
  finally { inFlight--; }
});
function env() {
  // Explicit allowlist: no user provider credentials, profile, extensions or model overrides.
  return { PATH: '/usr/bin:/bin', TMPDIR: os.tmpdir(), LANG: 'en_US.UTF-8', PI_CODING_AGENT_DIR: config, PI_CONFIG_DIR: '.d-pi-isolated-nonexistent', OPENAI_API_KEY: 'fixture' };
}
async function start(label, cwd = project) {
  const child = spawn(binary, ['--mode', 'rpc-ui', '--model', 'probe/probe', '--thinking', 'low', '--session-dir', path.join(root, 'sessions'), '--no-title', '--no-extensions', '--no-skills', '--no-rules', '--no-lsp', '--no-pty', '--approval-mode', 'yolo'], { cwd, env: env(), detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const c = { child, label, frames: [], stderr: '', chunks: undefined };
  clients.push(c);
  child.stderr.on('data', b => c.stderr = (c.stderr + b).slice(-4000));
  child.on('error', e => c.stderr += e.message);
  readline.createInterface({ input: child.stdout }).on('line', line => {
    try {
      let f = JSON.parse(line);
      if (f.type === 'rpc_chunk') {
        if (f.index === 0) c.chunks = [];
        c.chunks.push(Buffer.from(f.data, 'base64'));
        if (f.index !== f.count - 1) return;
        f = JSON.parse(Buffer.concat(c.chunks).toString()); c.chunks = undefined;
      }
      c.frames.push(f);
      if (f.type === 'host_tool_call') {
        const answer = text => c.child.stdin.write(JSON.stringify({ type: 'host_tool_result', id: f.id, result: { content: [{ type: 'text', text }] }, isError: false }) + '\n');
        if (f.toolName === 'gui_send_to_thread') routeThread.turn(f.arguments.message).then(() => answer('THREAD_B_COMPLETED')).catch(e => answer(`ROUTE_FAILED: ${e.message}`));
        else answer('HOST_ECHO_OK');
      }
    } catch (e) { c.stderr += `decoder: ${e.message}`; }
  });
  c.send = async (type, data = {}) => {
    const id = crypto.randomUUID();
    child.stdin.write(JSON.stringify({ id, type, ...data }) + '\n');
    return wait(() => c.frames.find(f => f.type === 'response' && f.id === id), `${label}/${type}`);
  };
  c.turn = async (message, extra = {}) => {
    const from = c.frames.length;
    const ack = await c.send('prompt', { message, ...extra }); assert.equal(ack.success, true, JSON.stringify(ack));
    await wait(() => c.frames.slice(from).find(f => f.type === 'agent_end' && f.isTerminal !== false), `${label}/turn ${message}`);
    return c.frames.slice(from);
  };
  await wait(() => c.frames.find(f => f.type === 'ready'), `${label}/ready`);
  assert.equal((await c.send('negotiate_protocol', { protocolVersion: 2 })).success, true);
  return c;
}
async function stop(c) {
  if (c.child.exitCode !== null || c.child.signalCode !== null) return;
  c.child.stdin.end();
  try { await wait(() => c.child.exitCode !== null || c.child.signalCode !== null, 'exit', 3000); }
  catch { try { process.kill(-c.child.pid, 'SIGKILL'); } catch {} }
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  fs.writeFileSync(path.join(config, 'models.yml'), JSON.stringify({ providers: { probe: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fixture', api: 'openai-completions',
    models: ['probe', 'alternate'].map(id => ({ id, name: id, reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }))
  } } }));
  fs.writeFileSync(path.join(config, 'config.yml'), JSON.stringify({ memory: { backend: 'local' }, autolearn: { enabled: true }, async: { enabled: false }, task: { batch: true, enableEffort: true, maxConcurrency: 2, isolation: { enabled: false } }, modelRoles: { default: 'probe/probe', smol: 'probe/probe' } }));
  fs.mkdirSync(path.join(project, '.omp/agents'), { recursive: true });
  for (const level of ['low', 'high']) fs.writeFileSync(path.join(project, `.omp/agents/probe-${level}.md`), `---\nname: probe-${level}\ndescription: Isolated test child\nmodel: probe/probe:${level}\n---\nReply READY without tools.\n`);
  if (process.argv[4] === 'settings') {
    await require('./settings-checks.cjs')({ check, start, requests, binary, project, env, execFileSync, assert });
    return;
  }
  const a = await start('A'), b = await start('B');
  routeThread = b;
  await check('standalone_runtime_and_two_sessions', async () => {
    peakInFlight = 0;
    await Promise.all([a.turn('PROBE_CONCURRENT_A'), b.turn('PROBE_CONCURRENT_B')]);
    const sa = (await a.send('get_state')).data, sb = (await b.send('get_state')).data;
    assert.notEqual(sa.sessionId, sb.sessionId);
    const ma = (await a.send('get_messages')).data, mb = (await b.send('get_messages')).data;
    assert(!JSON.stringify(ma).includes('PROBE_CONCURRENT_B')); assert(!JSON.stringify(mb).includes('PROBE_CONCURRENT_A'));
    assert.equal(peakInFlight, 2);
    return { distinctSessionIds: true, isolatedHistories: true, peakModelRequests: peakInFlight, path: env().PATH, version: execFileSync(binary, ['--version'], { env: env() }).toString().trim() };
  });
  await check('model_and_thinking_settings_are_session_scoped', async () => {
    assert.equal((await a.send('set_model', { provider: 'probe', modelId: 'alternate' })).success, true);
    assert.equal((await a.send('set_thinking_level', { level: 'high' })).success, true);
    const sa = (await a.send('get_state')).data, sb = (await b.send('get_state')).data;
    assert.equal(sa.model.id, 'alternate'); assert.equal(sa.thinkingLevel, 'high'); assert.equal(sb.model.id, 'probe');
    return { a: { model: sa.model.id, thinking: sa.thinkingLevel }, b: { model: sb.model.id, thinking: sb.thinkingLevel } };
  });
  await check('image_reaches_model_transport', async () => {
    await a.turn('PROBE_IMAGE', { images: [{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=' }] });
    assert(requests.some(r => JSON.stringify(r.users).includes('data:image/')));
    return { imageAtLocalProvider: true, note: 'OMP may transcode PNG to WebP before transport.', visualUnderstandingTested: false };
  });
  await check('host_tool_roundtrip', async () => {
    assert.equal((await a.send('set_host_tools', { tools: [{ name: 'gui_echo', label: 'GUI echo', description: 'Test host roundtrip', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] })).success, true);
    const frames = await a.turn('PROBE_HOST');
    assert(frames.some(f => f.type === 'host_tool_call'));
    assert(JSON.stringify(frames).includes('HOST_ECHO_OK'));
    return { callback: true, toolResultReturned: true };
  });
  await check('subagents_events_and_transcripts', async () => {
    assert.equal((await b.send('set_subagent_subscription', { level: 'events' })).success, true);
    const from = b.frames.length;
    const turn = b.turn('PROBE_SPAWN');
    await wait(() => b.frames.slice(from).filter(f => f.type === 'subagent_lifecycle' && f.payload.status === 'started').length >= 2, 'two child starts');
    const active = (await b.send('get_subagents')).data?.subagents || [];
    const frames = await turn;
    const agents = frames.filter(f => f.type === 'subagent_lifecycle' && f.payload.status === 'started').map(f => f.payload);
    assert(agents.length >= 2);
    const transcript = await b.send('get_subagent_messages', { subagentId: agents[0].id });
    assert.equal(transcript.success, true, JSON.stringify(transcript));
    assert(transcript.data.messages.length > 0);
    const results = frames.find(f => f.type === 'tool_execution_end' && f.toolName === 'task')?.result?.details?.results || [];
    assert.equal(results.length, 2); assert(results.every(x => x.exitCode === 0));
    assert.notEqual(results[0].resolvedThinkingLevel, results[1].resolvedThinkingLevel);
    return { activeCount: active.length, completedListCount: (await b.send('get_subagents')).data?.subagents?.length, agents, eventTypes: [...new Set(frames.filter(f => f.type.startsWith('subagent')).map(f => f.type))], transcriptMessages: transcript.data?.messages?.length, resolvedSettings: results.map(x => ({ id: x.id, model: x.resolvedModelIdentity, thinking: x.resolvedThinkingLevel, exitCode: x.exitCode })) };
  });
  await check('cross_thread_message_via_host_tool_adapter', async () => {
    assert.equal((await a.send('set_host_tools', { tools: [{ name: 'gui_send_to_thread', description: 'Send a message to test thread B', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }] })).success, true);
    const frames = await a.turn('PROBE_ROUTE');
    assert(JSON.stringify(frames).includes('THREAD_B_COMPLETED'));
    assert(JSON.stringify((await b.send('get_messages')).data).includes('FROM_A_TO_B_CANARY'));
    return { deliveredToIndependentSession: true, resultReturnedToSender: true, ownership: 'Test host routes a host-owned tool to another OMP process; not a built-in cross-thread API.' };
  });
  await check('local_memory_learn_then_new_session_injection', async () => {
    const frames = await a.turn('PROBE_LEARN');
    const result = frames.find(f => f.type === 'tool_execution_end' && f.toolName === 'learn');
    assert(result && !result.isError, JSON.stringify(result));
    const c = await start('C');
    const before = requests.length;
    await c.turn('PROBE_MEMORY_READ');
    assert(requests.slice(before).some(r => r.memoryInSystem));
    const other = path.join(root, 'other-project'); fs.mkdirSync(other);
    const d = await start('D', other);
    const otherBefore = requests.length; await d.turn('PROBE_OTHER_PROJECT');
    assert(!requests.slice(otherBefore).some(r => r.memoryInSystem));
    await stop(c); await stop(d);
    return { learnedThroughNativeTool: true, injectedIntoNewSession: true, absentInOtherProject: true };
  });
  await check('headless_settings_and_memory_commands', async () => {
    const evidence = [];
    for (const message of ['/settings', '/memory view', '/memory stats']) {
      const from = a.frames.length;
      const response = await a.send('prompt', { message });
      if (response.data?.agentInvoked !== false) await wait(() => a.frames.slice(from).find(f => f.type === 'agent_end' && f.isTerminal !== false), 'slash command model fallback');
      await sleep(100);
      evidence.push({ message, response, reachedModel: requests.some(r => JSON.stringify(r.users).includes(message)), output: a.frames.slice(from).filter(f => f.type === 'command_output').map(f => f.text) });
    }
    assert.equal(evidence[0].reachedModel, true);
    assert.equal(evidence[1].response.data.agentInvoked, false);
    assert.equal(evidence[2].response.data.agentInvoked, false);
    return evidence;
  });
  await check('native_config_cli_and_provider_request_limit', async () => {
    const cli = (...args) => JSON.parse(execFileSync(binary, ['config', ...args, '--json'], { cwd: project, env: env() }).toString());
    const set = cli('set', 'providers.maxInFlightRequests', '{"probe":1}');
    const get = cli('get', 'providers.maxInFlightRequests');
    const task = cli('get', 'task.maxConcurrency');
    const e = await start('E'), f = await start('F');
    peakInFlight = 0;
    await Promise.all([e.turn('PROBE_CONCURRENT_LIMIT_E'), f.turn('PROBE_CONCURRENT_LIMIT_F')]);
    const peak = peakInFlight; assert.equal(peak, 1);
    await stop(e); await stop(f);
    return { set, get, taskConcurrency: task, peakModelRequestsAcrossTwoProcesses: peak, scope: 'same isolated config root; read by fresh processes; live reload not tested' };
  });
})().catch(e => { checks.push({ name: 'fatal', passed: false, error: e.stack }); console.error(e); process.exitCode = 1; })
.finally(async () => {
  await Promise.all(clients.map(stop)); server.closeAllConnections(); await new Promise(r => server.close(r));
  const result = { date: new Date().toISOString(), upstreamTag: 'v18.3.0', upstreamCommit: '62bc57be1b03ef0802a33cf7f5f530e534527531', releaseAsset: 'omp-darwin-arm64', binarySha256: crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'), root, checks, processes: clients.map(c => ({ label: c.label, pid: c.child.pid, exitCode: c.child.exitCode, signal: c.child.signalCode, stderr: c.stderr })), limitations: ['Deterministic localhost provider, not model intelligence or real provider compatibility.', 'Direct RPC probes reuse previous Electron transport evidence; no new GUI or packaged app validation.', 'No load test or claim of complete TUI parity.'] };
  fs.writeFileSync(output, JSON.stringify(result, null, 2)); console.log(output);
  if (checks.some(c => !c.passed)) process.exitCode = 1;
});
