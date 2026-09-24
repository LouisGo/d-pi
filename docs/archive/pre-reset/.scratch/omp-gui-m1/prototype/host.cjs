const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
let port;
const args = ['--mode', 'rpc', '--model', 'm1-probe/probe', '--session-dir', path.join(__dirname, '.sessions'), '--no-title', '--no-extensions', '-e', path.join(__dirname, 'interaction.ts'), '--no-skills', '--no-rules', '--no-lsp', '--no-pty'];
if (process.env.PROBE_RESUME_SESSION) args.push('--resume', process.env.PROBE_RESUME_SESSION);
const child = spawn('/opt/homebrew/bin/omp', args, {
  cwd: __dirname, detached: true,
  env: { ...process.env, PI_CODING_AGENT_DIR: path.join(__dirname, '.agent'), OPENAI_API_KEY: 'probe-placeholder-not-a-real-key' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
process.parentPort.postMessage({ type: 'pid', pid: child.pid });
let ready;
readline.createInterface({ input: child.stdout }).on('line', line => {
  try {
    const frame = JSON.parse(line);
    if (frame.type === 'ready') ready = frame;
    if (port) port.postMessage(frame);
  } catch { process.parentPort.postMessage({ type: 'decode_error' }); }
});
child.stderr.on('data', data => process.parentPort.postMessage({ type: 'stderr', text: data.toString().slice(0, 2000) }));
child.on('error', e => process.parentPort.postMessage({ type: 'spawn_error', error: e.message }));
child.on('exit', (code, signal) => process.parentPort.postMessage({ type: 'omp_exit', code, signal }));
process.parentPort.on('message', ({ data, ports }) => {
  if (data.type === 'connect') {
    port?.close(); port = ports[0];
    port.on('message', ({ data: command }) => child.stdin.write(JSON.stringify(command) + '\n'));
    port.start();
    port.postMessage({ type: 'attached', pid: child.pid });
    if (ready) port.postMessage(ready);
  } else if (data.type === 'eof') child.stdin.end();
});
