import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

export function developmentEnvironment(root, env, home = homedir()) {
  if (env.D_PI_DATA_DIR && !isAbsolute(env.D_PI_DATA_DIR))
    throw new Error("D_PI_DATA_DIR must be an absolute path");
  const source = resolve(root);
  const id = createHash("sha256").update(source).digest("hex").slice(0, 12);
  return {
    ...env,
    D_PI_DATA_DIR:
      env.D_PI_DATA_DIR ||
      join(home, ".d-pi", "dev", `${basename(source)}-${id}`),
  };
}
