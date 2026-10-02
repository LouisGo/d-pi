// Runs in the same Bun process before importing the managed SDK entry. It has no
// project imports, credentials, persistence, or token-output idle timeout.
export const nativeBootstrap = String.raw`
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const supervisor = JSON.parse(process.env.D_PI_PROCESS_SUPERVISION);
const owner = process.ppid;
const birth = pid => new Promise(resolve => {
  execFile('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:1500},(error,stdout)=>{
    resolve(error ? null : stdout.trim().replace(/\s+/g,' ') || null);
  });
});
const originalExit = process.exit.bind(process);
let terminating = false;
const terminate = (reason, requestedExitCode = null) => {
  if(terminating) return;
  terminating = true;
  const kill = () => { try { process.kill(-process.pid,'SIGKILL'); } catch { originalExit(1); } };
  // Flush bounded evidence before killing the group; a broken pipe cannot delay cleanup.
  const fallback = setTimeout(kill,100); fallback.unref();
  try { process.stdout.write(JSON.stringify({type:'d_pi_native_termination',token:supervisor.token,reason,requestedExitCode})+'\n',()=>{clearTimeout(fallback);kill();}); }
  catch { kill(); }
};
// SDK EOF disposal may exit before the owner watchdog ticks. Never let that
// direct process exit strand children in the still-owned process group.
process.exit = code => terminate('sdk-exit',Number.isInteger(code) ? code : (process.exitCode ?? 0));
const ownerBirth = birth(owner);
const missing = pid => {
  try { process.kill(pid,0); return false; }
  catch(error) { return error.code === 'ESRCH'; }
};
let checking = false;
const watch = setInterval(async () => {
  if(checking || terminating) return;
  if(process.ppid !== owner) return terminate('watchdog-owner-changed');
  if(missing(owner)) return terminate('watchdog-owner-missing');
  if(supervisor.mainPid && missing(supervisor.mainPid)) return terminate('watchdog-main-missing');
  checking = true;
  try {
    const [original,current,main] = await Promise.all([ownerBirth,birth(owner),supervisor.mainPid ? birth(supervisor.mainPid) : null]);
    if(terminating) return;
    if(process.ppid !== owner) return terminate('watchdog-owner-changed');
    // A failed probe is unknown, never evidence of a replaced owner. Check
    // liveness separately and retry identity on the next non-overlapping tick.
    if(original && current && current !== original) return terminate('watchdog-owner-changed');
    if(main && main !== supervisor.mainBirth) return terminate('watchdog-main-changed');
  } finally { checking = false; }
},500);
watch.unref();
const startup = setTimeout(()=>terminate('permit-timeout'),10000);
process.stdout.write(JSON.stringify({type:'d_pi_native_bootstrap',token:supervisor.token})+'\n');
process.stdin.once('data', async bytes => {
  process.stdin.pause();
  try {
    const permit=JSON.parse(bytes.toString());
    if(permit.type!=='d_pi_native_permit'||permit.token!==supervisor.token||permit.allowed!==true) return terminate('permit-rejected');
    clearTimeout(startup);
    process.stdin.on('end',()=>{ const timer=setTimeout(()=>terminate('stdin-eof'),2000);timer.unref(); });
    await import(pathToFileURL(process.argv.at(-1)).href);
  } catch { terminate('bootstrap-error'); }
});
`;
