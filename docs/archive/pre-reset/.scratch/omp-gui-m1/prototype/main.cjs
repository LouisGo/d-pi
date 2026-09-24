const { app, BrowserWindow, utilityProcess, MessageChannelMain, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const http = require('node:http');
const events = [];
const checks = [];
let childPid, host, win, server;
function receive(source, data) { events.push({ source, ...data }); }
async function waitFor(predicate, from = 0, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const item = events.slice(from).find(predicate);
    if (item) return item;
    await new Promise(r => setTimeout(r, 25));
  }
  throw Error('Timed out waiting for probe event');
}
function attach() {
  const { port1, port2 } = new MessageChannelMain();
  host.postMessage({ type: 'connect' }, [port1]);
  win.webContents.postMessage('probe-port', null, [port2]);
}
async function command(type, extra = {}) {
  const id = `${type}-${events.length}`;
  const from = events.length;
  win.webContents.send('probe-command', { id, type, ...extra });
  return await waitFor(x => x.id === id && x.type === 'response', from);
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
app.whenReady().then(async () => {
  try {
    // Deterministic local model transport, never sends a request to a real provider.
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const frame = (delta, finish_reason = null) => ({ id: 'probe', object: 'chat.completion.chunk', created: 1, model: 'probe', choices: [{ index: 0, delta, finish_reason }] });
        res.write(`data: ${JSON.stringify(frame({ role: 'assistant', content: 'local model fixture' }))}\n\n`);
        res.write(`data: ${JSON.stringify(frame({}, 'stop'))}\n\n`);
        res.end('data: [DONE]\n\n');
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const agentDir = path.join(__dirname, '.agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'models.yml'), JSON.stringify({ providers: { 'm1-probe': {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fixture', api: 'openai-completions',
      models: [{ id: 'probe', name: 'Probe', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    } } }));
    host = utilityProcess.fork(path.join(__dirname, 'host.cjs'));
    host.on('message', data => { if (data.type === 'pid') childPid = data.pid; receive('host', data); });
    host.on('exit', code => receive('main', { type: 'host_exit', code }));
    win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    ipcMain.on('probe-observed', (event, data) => { if (event.sender === win.webContents) receive('renderer', data); });
    await win.loadURL('data:text/html,<title>OMP boundary probe</title>');
    attach();
    const ready = await waitFor(x => x.type === 'ready' || x.type === 'omp_exit');
    assert.equal(ready.type, 'ready', 'OMP exited before readiness');
    assert(ready.supportedProtocolVersions.includes(2));
    assert.equal((await command('negotiate_protocol', { protocolVersion: 2 })).success, true);
    assert.equal((await command('get_state')).success, true);
    checks.push('Renderer MessagePort -> utilityProcess -> real OMP RPC v2 -> Renderer');
    const turnFrom = events.length;
    assert.equal((await command('prompt', { message: 'local persistence fixture' })).success, true);
    await waitFor(x => x.type === 'agent_end' && x.isTerminal !== false, turnFrom);
    assert(JSON.stringify((await command('get_messages')).data).includes('local model fixture'));
    checks.push('Real OMP completes an agent turn against deterministic localhost model transport');
    const interactionFrom = events.length;
    assert.equal((await command('prompt', { message: '/probe-confirm' })).success, true);
    const question = await waitFor(x => x.type === 'extension_ui_request' && x.method === 'confirm', interactionFrom);
    win.webContents.send('probe-command', { type: 'extension_ui_response', id: question.id, confirmed: true });
    await waitFor(x => x.type === 'extension_ui_request' && x.method === 'notify' && x.message === 'probe-confirm-result:true', interactionFrom);
    checks.push('Real OMP extension confirm round-trip through Renderer port');
    const marker = await command('bash', { command: 'printf d-pi-m1-native-history' });
    assert.equal(marker.success, true);
    assert(marker.data.output.includes('d-pi-m1-native-history'));
    const bashId = 'long-bash';
    win.webContents.send('probe-command', { id: bashId, type: 'bash', command: 'sleep 20' });
    await new Promise(r => setTimeout(r, 500));
    const from = events.length;
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
    attach();
    const attached = await waitFor(x => x.type === 'attached', from);
    assert.equal(attached.pid, childPid);
    assert.equal((await command('get_state')).success, true);
    checks.push('Renderer reload preserves OMP PID and permits RPC while bash is pending');
    assert.equal((await command('abort_bash')).success, true);
    const stopped = await waitFor(x => x.id === bashId && x.type === 'response');
    assert.equal(stopped.data.cancelled, true);
    checks.push({ check: 'abort_bash settles pending command', success: stopped.success, data: stopped.data });
    const state = await command('get_state');
    const sessionFile = state.data.sessionFile;
    assert(sessionFile);
    host.postMessage({ type: 'eof' });
    const closed = await waitFor(x => x.type === 'omp_exit');
    assert.equal(closed.code, 0);
    checks.push('stdin EOF with stdout draining exits OMP with code 0 after abort');
    host.kill();
    const resumedFrom = events.length;
    host = utilityProcess.fork(path.join(__dirname, 'host.cjs'), [], { env: { ...process.env, PROBE_RESUME_SESSION: sessionFile } });
    host.on('message', data => { if (data.type === 'pid') childPid = data.pid; receive('host', data); });
    attach();
    await waitFor(x => x.type === 'ready', resumedFrom);
    const restored = await command('get_state');
    assert.equal(restored.data.sessionId, state.data.sessionId);
    const messages = await command('get_messages');
    assert.equal(messages.success, true);
    assert(JSON.stringify(messages.data).includes('d-pi-m1-native-history'));
    checks.push('Fresh utilityProcess and OMP resume original session ID and native bash history');
    assert(JSON.stringify(messages.data).includes('local model fixture'));
    const result = { passed: true, electron: process.versions.electron, omp: '18.3.0', checks, limitations: ['Model output is a deterministic localhost fixture; no real provider or visible GUI interaction. Large-frame reassembly and process-crash cleanup remain implementation acceptance tests.'] };
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ passed: false, checks, error: error.stack, observedTypes: events.map(x => x.type), diagnostics: events.filter(x => ['stderr', 'omp_exit', 'spawn_error'].includes(x.type)) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (childPid && alive(childPid)) { try { process.kill(-childPid, 'SIGKILL'); } catch {} }
    host?.kill();
    server?.close();
    app.exit(process.exitCode || 0);
  }
});
