import { createInterface } from 'node:readline';
const { SessionManager } = await import(process.argv[2]);
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
let manager;
for await (const line of createInterface({ input: process.stdin })) {
  try {
    const command = JSON.parse(line);
    if (command.kind === 'seed') {
      manager = SessionManager.create(process.cwd(), process.env.PI_CODING_AGENT_SESSION_DIR);
      await manager.ensureOnDisk();
      manager.appendCustomEntry('probe-seed', { value: 1 });
      await manager.flush();
    } else if (command.kind === 'open') {
      manager = await SessionManager.open(command.path, undefined, undefined, { throwIfMissing: true, suppressBreadcrumb: true });
    } else if (command.kind === 'append') {
      manager.appendCustomEntry(command.marker, { value: command.marker });
      await manager.flush();
    } else if (command.kind === 'close') {
      manager.seal();
      await manager.close();
      send({ kind: 'closed', pid: process.pid });
      break;
    }
    send({ kind: command.kind, pid: process.pid, sessionFile: manager.getSessionFile(), markers: manager.getEntries().filter(x => x.type === 'custom').map(x => ({ id: x.id, parentId: x.parentId, marker: x.customType })) });
  } catch (error) { send({ error: error.message }); }
}
