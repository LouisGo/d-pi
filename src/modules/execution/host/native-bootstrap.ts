// Runs in the same Bun process before importing the managed SDK entry. It has no
// project imports, credentials, persistence, or token-output idle timeout.
export const nativeBootstrap = String.raw`
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const supervisor = JSON.parse(process.env.D_PI_PROCESS_SUPERVISION);
const owner = process.ppid;
const birth = pid => {
  try { return execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:1500}).trim().replace(/\s+/g,' '); }
  catch { return null; }
};
const originalExit = process.exit.bind(process);
const terminate = () => { try { process.kill(-process.pid,'SIGKILL'); } catch { originalExit(1); } };
// SDK EOF disposal may exit before the owner watchdog ticks. Never let that
// direct process exit strand children in the still-owned process group.
process.exit = () => terminate();
const ownerBirth = birth(owner);
const watch = setInterval(() => {
  if (process.ppid !== owner || birth(owner) !== ownerBirth ||
      (supervisor.mainPid && birth(supervisor.mainPid) !== supervisor.mainBirth)) terminate();
},500);
watch.unref();
const startup = setTimeout(terminate,10000);
process.stdout.write(JSON.stringify({type:'d_pi_native_bootstrap',token:supervisor.token})+'\n');
process.stdin.once('data', async bytes => {
  process.stdin.pause();
  try {
    const permit=JSON.parse(bytes.toString());
    if(permit.type!=='d_pi_native_permit'||permit.token!==supervisor.token||permit.allowed!==true) return terminate();
    clearTimeout(startup);
    process.stdin.on('end',()=>{ const timer=setTimeout(terminate,2000);timer.unref(); });
    await import(pathToFileURL(process.argv.at(-1)).href);
  } catch { terminate(); }
});
`;
