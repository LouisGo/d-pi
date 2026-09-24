const { spawn, execFileSync } = require('node:child_process');
const readline = require('node:readline');
let child;
process.parentPort.on('message', ({ data, ports }) => {
  if (data.type === 'eof') { child?.stdin.end(); return; }
  if (data.type !== 'start') return;
  const port = ports[0];
  const env = { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PI_CODING_AGENT_DIR: data.cfg, PI_CONFIG_DIR: '.d-pi-isolated-nonexistent' };
  try {
    const version = execFileSync(data.ompPath, ['--version'], { env }).toString().trim();
    child = spawn(data.ompPath, ['--mode', 'rpc-ui', '--model', 'fixture/fixture', '--no-title', '--no-extensions', '--no-skills', '--no-rules', '--no-lsp', '--no-pty'], { cwd: data.project, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    process.parentPort.postMessage({ type: 'omp-start', pid: child.pid, version });
    readline.createInterface({ input: child.stdout }).on('line', line => {
      try { port.postMessage(JSON.parse(line)); }
      catch (e) { process.parentPort.postMessage({ type: 'host-error', error: e.message }); }
    });
    child.stderr.on('data', b => process.parentPort.postMessage({ type: 'stderr', text: b.toString().slice(0, 2000) }));
    child.on('error', e => process.parentPort.postMessage({ type: 'spawn-error', error: e.message }));
    child.on('exit', (code, signal) => { process.parentPort.postMessage({ type: 'omp-exit', code, signal }); setTimeout(() => process.exit(code === 0 ? 0 : 1), 50); });
    port.on('message', ({ data: cmd }) => child.stdin.write(JSON.stringify(cmd) + '\n')); port.start();
  } catch (e) { process.parentPort.postMessage({ type: 'host-error', error: e.stack }); }
});
