const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");
app.whenReady().then(() => {
  const db = new DatabaseSync(process.env.D_PI_PROBE_DB);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE; UPDATE draft SET body='uncommitted'",
  );
  console.log("transaction-open");
  process.kill(process.pid, "SIGKILL");
});
