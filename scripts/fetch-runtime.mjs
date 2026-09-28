import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, readFile, rename, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
const root = new URL("../resources/omp/", import.meta.url);
const release = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
if (`${process.platform}-${process.arch}` !== release.platform) throw Error("This Runtime artifact is verified for macOS arm64 only");
const destination = new URL("omp", root);
const temporary = new URL("omp.download", root);
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
let available = false;
try { available = (await digest(destination)) === release.sha256; } catch {}
if (!available) {
  let downloaded = false;
  try { downloaded = (await digest(temporary)) === release.sha256; } catch {}
  if (!downloaded) {
    const response = await fetch(release.url);
    if (!response.ok || !response.body) throw Error(`Official Runtime download failed: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { mode: 0o600 }));
  }
  if ((await digest(temporary)) !== release.sha256) {
    await rm(temporary, { force: true });
    throw Error("Official Runtime checksum mismatch");
  }
  await chmod(temporary, 0o755);
  await rename(temporary, destination);
}
console.log(`Verified official OMP ${release.version} (${release.platform})`);
