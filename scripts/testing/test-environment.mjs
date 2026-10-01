import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

const ownedVariables = new Set([
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TMPDIR",
  "TMP",
  "TEMP",
  "PWD",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_CACHE_HOME",
  "D_PI_DATA_DIR",
  "PI_CODING_AGENT_DIR",
  "PI_CODING_AGENT_SESSION_DIR",
  "PI_CONFIG_DIR",
]);

/** An allowlist, rather than deleting known keys, also excludes future credentials. */
export function createTestEnvironment({
  toolPaths = [],
  fixtureEnv = {},
  prefix = "d-pi-test-",
} = {}) {
  for (const key of Object.keys(fixtureEnv))
    if (ownedVariables.has(key))
      throw new Error(
        `Test isolation owns ${key}; put fixtures in the returned directories`,
      );
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const home = join(root, "home");
  const cwd = join(root, "work");
  const data = join(root, "app-data");
  const config = join(home, ".omp", "agent");
  const sessions = join(root, "omp-sessions");
  const temporary = join(root, "tmp");
  const xdg = Object.fromEntries(
    ["config", "data", "state", "cache"].map((kind) => [
      kind,
      join(root, "xdg", kind),
    ]),
  );
  const appdata = join(home, "AppData", "Roaming");
  const localappdata = join(home, "AppData", "Local");
  for (const path of [
    home,
    cwd,
    data,
    config,
    sessions,
    temporary,
    appdata,
    localappdata,
    ...Object.values(xdg),
  ])
    mkdirSync(path, { recursive: true });
  const env = {
    PATH: [
      ...new Set([
        dirname(process.execPath),
        ...toolPaths,
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ]),
    ].join(delimiter),
    ...(process.platform === "win32" && process.env.SystemRoot
      ? { SystemRoot: process.env.SystemRoot }
      : {}),
    HOME: home,
    USERPROFILE: home,
    APPDATA: appdata,
    LOCALAPPDATA: localappdata,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    PWD: cwd,
    XDG_CONFIG_HOME: xdg.config,
    XDG_DATA_HOME: xdg.data,
    XDG_STATE_HOME: xdg.state,
    XDG_CACHE_HOME: xdg.cache,
    D_PI_DATA_DIR: data,
    PI_CODING_AGENT_DIR: config,
    PI_CODING_AGENT_SESSION_DIR: sessions,
    PI_CONFIG_DIR: ".omp",
    OMP_PROFILE: "",
    PI_PROFILE: "",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    CI: "1",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    ...fixtureEnv,
  };
  return {
    root,
    home,
    cwd,
    data,
    config,
    sessions,
    temporary,
    env,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
