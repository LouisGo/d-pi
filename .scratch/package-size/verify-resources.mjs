import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { auditPackagedApp } from "../../scripts/packaging/after-pack.mjs";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const app = resolve(process.argv[2]);
const sdk = join(app, "Contents/Resources/sdk");
const sandbox = createTestEnvironment({ prefix: "d-pi-packaged-runtime-" });
const tests = [];
function probe(binary, args, name) {
  const result = spawnSync(binary, args, { cwd: sandbox.cwd, env: sandbox.env, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${name}: ${result.error?.message ?? result.stderr}`);
  tests.push({ name, status: result.status });
}
try {
  const compiled = join(sandbox.root, "sdk-resource.mjs");
  execFileSync(resolve("node_modules/bun/bin/bun.exe"), ["build", "src/platform/omp/resources/sdk-resource.ts", "--target=node", "--format=esm", `--outfile=${compiled}`], { stdio: "pipe" });
  probe(process.execPath, ["--input-type=module", "--eval", `import{managedSdkRuntime}from${JSON.stringify(compiled)};await managedSdkRuntime(${JSON.stringify(join(app, "Contents/Resources"))});`], "shared Main SDK resource validation in relocated app");
  probe(join(sdk, "bun"), ["--eval", `const sdk=await import(${JSON.stringify(join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts"))});if(typeof sdk.createAgentSession!=='function')throw Error('SDK factory unavailable');`], "packaged Bun/official SDK factory from isolated cwd");
  probe(process.execPath, ["--input-type=module", "--eval", `import{createRequire}from'node:module';import{pathToFileURL}from'node:url';import{realpathSync}from'node:fs';const r=createRequire(realpathSync(${JSON.stringify(join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/package.json"))}));const tr=r.resolve('@huggingface/transformers');const ort=createRequire(tr)('onnxruntime-node');const tensor=new ort.Tensor('float32',new Float32Array([42]),[1]);if(tensor.data[0]!==42)throw Error('ORT native invalid');const hf=await import(pathToFileURL(tr.replace(/\.cjs$/,'.mjs')));if(typeof hf.pipeline!=='function')throw Error('Transformers invalid');process.exit(0);`], "packaged ONNX dyld alias and Transformers ESM in isolated Node child; no models downloaded");
  const audit = await auditPackagedApp(app, { platform: "darwin", arch: "arm64" });
  tests.push({ name: "relocated package audit", appBytes: audit.app.bytes, sdkBytes: audit.sdk.bytes });
  const manifest = JSON.parse(readFileSync(join(sdk, "manifest.json"), "utf8"));
  const result = { platform: manifest.platform, sdk: manifest.sdkVersion, bun: manifest.bunVersion, tests, limitation: "Resource and import probes only, not Electron GUI, actual inference or real provider acceptance" };
  if (process.argv[3]) writeFileSync(process.argv[3], `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally { sandbox.cleanup(); }
