// Disposable, isolated OMP 18.3.0 protocol experiment. No real provider traffic.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const readline = require('node:readline');

const scenario = process.argv[2] || 'interaction';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd-pi-rpc-ui-'));
const agentDir = path.join(root, 'agent');
const sessions = path.join(root, 'sessions');
fs.mkdirSync(agentDir); fs.mkdirSync(sessions);
const frames = [], requests = [];
let child, releaseFirst;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function until(predicate, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const end = Date.now() + timeout;
    const poll = () => {
      const found = frames.find(predicate);
      if (found) return resolve(found);
      if (Date.now() > end) return reject(Error('Timed out: ' + predicate.toString().slice(0, 150)));
      setTimeout(poll, 15);
    }; poll();
  });
}
function send(type, data = {}) {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  child.stdin.write(JSON.stringify({ id, type, ...data }) + '\n');
  return until(f => f.type === 'response' && f.id === id);
}
function eventStream(res, items) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const frame = (delta, finish_reason = null) => ({ id: 'probe', object: 'chat.completion.chunk', created: 1, model: 'probe', choices: [{ index: 0, delta, finish_reason }] });
  for (const [delta, finish] of items) res.write(`data: ${JSON.stringify(frame(delta, finish))}\n\n`);
  res.end('data: [DONE]\n\n');
}
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  let parsed; try { parsed = JSON.parse(body); } catch { parsed = {}; }
  requests.push({ roles: (parsed.messages || []).map(m => m.role), users: (parsed.messages || []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), tools: (parsed.tools || []).map(t => t.function?.name || t.name), askSchema: (parsed.tools || []).find(t => (t.function?.name || t.name) === 'ask') });
  if ((scenario.startsWith('interaction') || scenario === 'ask') && requests.length === 1) {
    const name = scenario === 'ask' ? 'ask' : 'bash';
    const args = scenario === 'ask' ? { i: 'Checking built-in question', questions: [{ id: 'choice', question: 'Choose one', options: [{ label: 'Alpha' }, { label: 'Beta' }] }] } : { command: 'printf builtin-rpc-ui-probe' };
    eventStream(res, [[{ role: 'assistant', tool_calls: [{ index: 0, id: 'call_probe', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, null], [{}, 'tool_calls']]);
  } else {
    if (!scenario.startsWith('interaction') && scenario !== 'ask' && requests.length === 1) await new Promise(r => { releaseFirst = r; });
    eventStream(res, [[{ role: 'assistant', content: `fixture-turn-${requests.length}` }, null], [{}, 'stop']]);
  }
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  fs.writeFileSync(path.join(agentDir, 'models.yml'), JSON.stringify({ providers: { 'probe': {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fixture', api: 'openai-completions',
    models: [{ id: 'probe', name: 'Probe', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } }));
  child = spawn('/opt/homebrew/bin/omp', ['--mode', 'rpc-ui', '--model', 'probe/probe', '--session-dir', sessions, '--no-title', '--no-extensions', '--no-skills', '--no-rules', '--no-lsp', '--approval-mode', 'always-ask'], {
    cwd: root, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, OPENAI_API_KEY: 'probe-placeholder' }, stdio: ['pipe', 'pipe', 'pipe'], detached: true,
  });
  readline.createInterface({ input: child.stdout }).on('line', line => { try { frames.push(JSON.parse(line)); } catch { frames.push({ type: 'non_json', line: line.slice(0, 100) }); } });
  let stderr = ''; child.stderr.on('data', b => { stderr += b.toString(); });
  await until(f => f.type === 'ready');
  await send('negotiate_protocol', { protocolVersion: 2 });
  const first = await send('prompt', { message: scenario.startsWith('interaction') ? 'Run printf builtin-rpc-ui-probe with bash.' : scenario === 'ask' ? 'Ask me to choose one.' : 'First request.' });
  const outcome = { scenario, version: '18.3.0', firstAck: first, root };
  if (scenario.startsWith('interaction') || scenario === 'ask') {
    const ui = await until(f => f.type === 'extension_ui_request' && ['select', 'confirm', 'input', 'editor'].includes(f.method), 15000);
    outcome.uiRequest = ui;
    child.stdin.write(JSON.stringify(scenario === 'interaction-approve' ? { type: 'extension_ui_response', id: ui.id, value: 'Approve' } : scenario === 'interaction-deny' ? { type: 'extension_ui_response', id: ui.id, value: 'Deny' } : scenario === 'ask' ? { type: 'extension_ui_response', id: ui.id, value: 'Alpha' } : { type: 'extension_ui_response', id: ui.id, cancelled: true }) + '\n');
    await until(f => f.type === 'agent_end' && f.isTerminal !== false);
    const state = await send('get_state'); outcome.state = { streaming: state.data?.isStreaming, queued: state.data?.queuedMessageCount };
  } else if (scenario === 'queue' || scenario === 'stop' || scenario === 'stop-followups') {
    await until(() => requests.length >= 1);
    outcome.followA = await send('prompt', { message: 'Follow up A', streamingBehavior: 'followUp' });
    outcome.followB = await send('prompt', { message: 'Follow up B', streamingBehavior: 'followUp' });
    if (scenario !== 'stop-followups') outcome.steer = await send('prompt', { message: 'Steer C', streamingBehavior: 'steer' });
    const before = await send('get_state'); outcome.before = { streaming: before.data?.isStreaming, queued: before.data?.queuedMessageCount };
    if (scenario.startsWith('stop')) outcome.abort = await send('abort');
    releaseFirst?.();
    await sleep(2500);
    const after = await send('get_state'); outcome.after = { streaming: after.data?.isStreaming, queued: after.data?.queuedMessageCount };
    if (scenario === 'stop-followups') {
      outcome.resume = await send('prompt', { message: 'Resume after abort' });
      await sleep(2000);
      const resumed = await send('get_state'); outcome.resumed = { streaming: resumed.data?.isStreaming, queued: resumed.data?.queuedMessageCount };
    }
  }
  outcome.requests = requests.map(({ users }) => users.map(u => { try { const content = JSON.parse(u); return content.map(x => x.text || '').join('').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/<system-notice>[\s\S]*?<\/system-notice>/g, '').trim(); } catch { return u.slice(0, 200); } }));
  outcome.frames = frames.filter(f => ['response', 'extension_ui_request', 'agent_start', 'agent_end', 'turn_start', 'turn_end', 'message_end', 'error', 'prompt_result'].includes(f.type)).map(f => ({ type: f.type, id: f.type === 'extension_ui_request' ? f.id : undefined, command: f.command, success: f.success, method: f.method, title: f.title, options: f.options, isTerminal: f.isTerminal, role: f.message?.role, toolName: f.message?.toolName, content: f.message?.role === 'toolResult' ? f.message.content : undefined, isError: f.message?.role === 'toolResult' ? f.message.isError : undefined }));
  outcome.stderr = stderr.slice(0, 1000);
  const file = path.join(__dirname, `rpc-ui-${scenario}-result.json`);
  fs.writeFileSync(file, JSON.stringify(outcome, null, 2));
  console.log(file);
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
  releaseFirst?.();
  if (child) { try { child.stdin.end(); } catch {} await sleep(500); try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  server.close();
});
