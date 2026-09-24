// macOS arm64 minimal .app packaging probe, no project dependencies or UI build.
// node run.cjs /absolute/electron-v44.4.5-darwin-arm64.zip /absolute/omp [result.json]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const [zip, omp, output = path.join(__dirname, '../packaged-result.json')] = process.argv.slice(2);
assert(zip && omp, 'Provide Electron zip and OMP binary');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd-pi-bundle-'));
const build = path.join(root, 'build'); fs.mkdirSync(build);
execFileSync('/usr/bin/ditto', ['-x', '-k', path.resolve(zip), build]);
const original = path.join(build, 'Electron.app');
const resources = path.join(original, 'Contents/Resources');
fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
const source = path.join(resources, 'app'); fs.mkdirSync(source);
for (const file of ['main.cjs', 'host.cjs', 'preload.cjs']) fs.copyFileSync(path.join(__dirname, file), path.join(source, file));
fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'd-pi-bundle-probe', version: '0.0.0', main: 'main.cjs' }));
fs.writeFileSync(path.join(source, 'index.html'), '<!doctype html><meta charset="utf-8"><title>OMP bundle boundary probe</title>');
fs.mkdirSync(path.join(resources, 'runtime'));
fs.copyFileSync(path.resolve(omp), path.join(resources, 'runtime/omp')); fs.chmodSync(path.join(resources, 'runtime/omp'), 0o755);
const plist = path.join(original, 'Contents/Info.plist');
fs.renameSync(path.join(original, 'Contents/MacOS/Electron'), path.join(original, 'Contents/MacOS/OMP Bundle Probe'));
execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleExecutable OMP Bundle Probe', plist]);
execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIdentifier dev.dpi.bundle-probe', plist]);
execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleName OMP Bundle Probe', plist]);
const moved = path.join(root, 'Moved App With Spaces'); fs.mkdirSync(moved);
const bundle = path.join(moved, 'OMP Bundle Probe.app'); fs.renameSync(original, bundle);
// LaunchServices entry, rather than invoking Electron with a development project path.
execFileSync('/usr/bin/open', ['-n', '-W', bundle, '--args', '--probe-root', root], { timeout: 60000, stdio: 'pipe' });
const result = JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8'));
result.launch = { method: 'macOS open -n -W (LaunchServices)', relocatedBundle: bundle, appAsar: false, electronZipSha256: crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex') };
result.processesStopped = [result.mainPid, result.hostPid, result.ompPid].every(pid => { if (!pid) return false; try { process.kill(pid, 0); return false; } catch { return true; } });
result.limitations = ['Hidden renderer, no product UI validation.', 'Unpacked Resources/app, not production ASAR or electron-builder configuration.', 'Local fixture provider; no authentication or real provider verification.', 'No clean-machine, Gatekeeper, signing/notarization, Windows or Intel validation.'];
fs.writeFileSync(output, JSON.stringify(result, null, 2));
assert(result.passed, result.error); assert(result.processesStopped, 'Probe processes remain alive');
console.log(JSON.stringify({ passed: true, checks: result.checks, processesStopped: true, output, bundle }, null, 2));
