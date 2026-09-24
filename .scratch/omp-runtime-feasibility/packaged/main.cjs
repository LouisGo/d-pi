// Minimal packaged Electron boundary probe. No product UI or provider credentials.
const { app, BrowserWindow, utilityProcess, MessageChannelMain, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = process.argv[process.argv.indexOf('--probe-root') + 1];
if (!root || !path.isAbsolute(root)) throw Error('Missing absolute --probe-root');
app.setPath('userData', path.join(root, 'desktop-data'));
const events = [], checks = [];
let host, window, server, ompPid, hostPid, requestCount = 0;
async function wait(predicate, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = predicate(); if (value) return value; await new Promise(r => setTimeout(r, 20)); }
  throw Error(`Timeout: ${label}`);
}
async function command(type, extra = {}) {
  const id = crypto.randomUUID();
  window.webContents.send('command', { id, type, ...extra });
  const result = await wait(() => events.find(e => e.source === 'renderer' && e.type === 'response' && e.id === id), type);
  assert.equal(result.success, true, JSON.stringify(result));
  return result;
}
app.whenReady().then(async () => {
  const result = { passed: false, electron: process.versions.electron, packaged: app.isPackaged, execPath: process.execPath, resourcesPath: process.resourcesPath, checks };
  try {
    assert(app.isPackaged); assert(process.execPath.includes('.app/Contents/MacOS/'));
    const ompPath = path.join(process.resourcesPath, 'runtime', 'omp');
    fs.accessSync(ompPath, fs.constants.X_OK);
    result.ompPath = ompPath;
    result.ompSha256 = crypto.createHash('sha256').update(fs.readFileSync(ompPath)).digest('hex');
    const cfg = path.join(root, 'omp-config'); fs.mkdirSync(cfg, { recursive: true });
    const project = path.join(root, 'project'); fs.mkdirSync(project, { recursive: true });
    server = http.createServer((req, res) => {
      req.resume(); req.on('end', () => {
        requestCount++;
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const frame = (delta, finish_reason) => ({ id: 'bundle', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] });
        res.write(`data: ${JSON.stringify(frame({ role: 'assistant', content: 'BUNDLED_OMP_OK' }, null))}\n\n`);
        res.write(`data: ${JSON.stringify(frame({}, 'stop'))}\n\n`); res.end('data: [DONE]\n\n');
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    fs.writeFileSync(path.join(cfg, 'models.yml'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fixture', api: 'openai-completions', models: [{ id: 'fixture', name: 'fixture', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    fs.writeFileSync(path.join(cfg, 'config.yml'), JSON.stringify({ memory: { backend: 'off' }, async: { enabled: false } }));
    host = utilityProcess.fork(path.join(__dirname, 'host.cjs'));
    host.on('spawn', () => { hostPid = host.pid; });
    host.on('message', e => { if (e.type === 'omp-start') ompPid = e.pid; events.push({ source: 'host', ...e }); });
    host.on('exit', code => events.push({ source: 'main', type: 'host-exit', code }));
    window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    ipcMain.on('observed', (event, data) => { if (event.sender === window.webContents) events.push({ source: 'renderer', ...data }); });
    await window.loadFile(path.join(__dirname, 'index.html'));
    result.rendererURL = window.webContents.getURL();
    const { port1, port2 } = new MessageChannelMain();
    host.postMessage({ type: 'start', ompPath, cfg, project }, [port1]);
    window.webContents.postMessage('port', null, [port2]);
    await wait(() => events.find(e => e.source === 'renderer' && e.type === 'ready'), 'OMP ready');
    result.ompVersion = events.find(e => e.type === 'omp-start')?.version;
    assert.equal(result.ompVersion, 'omp/18.3.0');
    checks.push('Packaged app resolves and executes bundled OMP 18.3.0 with PATH=/usr/bin:/bin');
    await command('negotiate_protocol', { protocolVersion: 2 });
    const state = await command('get_state'); assert(state.data.sessionId);
    checks.push('Packaged preload MessagePort → utility SessionHost → OMP RPC v2 → renderer');
    await command('prompt', { message: 'Reply with the fixture marker.' });
    await wait(() => events.find(e => e.source === 'renderer' && e.type === 'agent_end' && e.isTerminal !== false), 'terminal');
    assert(events.some(e => e.source === 'renderer' && e.type === 'message_end' && e.message?.role === 'assistant' && JSON.stringify(e.message.content).includes('BUNDLED_OMP_OK')));
    assert(requestCount > 0);
    checks.push('Real bundled OMP completes a model turn; renderer receives BUNDLED_OMP_OK');
    host.postMessage({ type: 'eof' });
    const exit = await wait(() => events.find(e => e.type === 'omp-exit'), 'OMP exit');
    assert.equal(exit.code, 0);
    const hostExit = await wait(() => events.find(e => e.type === 'host-exit'), 'Host exit'); assert.equal(hostExit.code, 0);
    checks.push('OMP and utility SessionHost exit normally after stdio EOF');
    result.passed = true;
  } catch (e) { result.error = e.stack; }
  finally {
    result.mainPid = process.pid; result.hostPid = hostPid; result.ompPid = ompPid; result.modelRequests = requestCount;
    result.diagnostics = events.filter(e => ['spawn-error', 'stderr', 'host-error', 'omp-exit', 'host-exit'].includes(e.type));
    if (!result.passed) { if (ompPid) { try { process.kill(-ompPid, 'SIGKILL'); } catch {} } host?.kill(); }
    server?.closeAllConnections(); server?.close();
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
    app.exit(result.passed ? 0 : 1);
  }
});
