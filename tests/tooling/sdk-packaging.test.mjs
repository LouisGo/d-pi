import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  auditSdkTree,
  copySdkDependencyGraph,
  measureTree,
  SDK_SIZE_LIMIT,
} from "../../scripts/runtime/sdk-packaging.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-sdk-packaging-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(path, content) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    return join(root, path);
  }
  function packagePath(name, metadata = {}) {
    const path = `store/${name.replaceAll("/", "+")}@1/node_modules/${name}`;
    write(
      `${path}/package.json`,
      JSON.stringify({ name, version: "1", ...metadata }),
    );
    write(`${path}/index.js`, "runtime source");
    return join(root, path);
  }
  return { root, write, packagePath };
}

test("declared peers and cycles resolve within the copied graph, while optional missing peers remain absent", async (t) => {
  const { root, packagePath } = fixture(t);
  const a = packagePath("a", {
    dependencies: { b: "1" },
    peerDependencies: { peer: "1", missing: "1" },
    peerDependenciesMeta: { missing: { optional: true } },
  });
  const b = packagePath("b", { dependencies: { a: "1" } });
  const peer = packagePath("peer");
  symlinkSync("../../b@1/node_modules/b", join(dirname(a), "b"));
  symlinkSync("../../peer@1/node_modules/peer", join(dirname(a), "peer"));
  symlinkSync("../../a@1/node_modules/a", join(dirname(b), "a"));
  const sdk = join(root, "sdk");
  const graph = await copySdkDependencyGraph([a], join(root, "store"), sdk);
  assert.equal(graph.packages, 3);
  assert.equal(
    realpathSync(join(sdk, "node_modules/.pnpm/a@1/node_modules/b")),
    join(sdk, "node_modules/.pnpm/b@1/node_modules/b"),
  );
  assert.equal((await auditSdkTree(sdk)).links, 3);
  assert.equal((await measureTree(sdk)).files, 6);
  assert.ok(peer);
});

test("missing required runtime dependencies and dependencies outside the managed store fail", async (t) => {
  const { root, packagePath, write } = fixture(t);
  const a = packagePath("a", { dependencies: { missing: "1" } });
  await assert.rejects(
    copySdkDependencyGraph([a], join(root, "store"), join(root, "missing-sdk")),
    /ENOENT/,
  );
  write(
    "outside/package.json",
    JSON.stringify({ name: "missing", version: "1" }),
  );
  symlinkSync(join(root, "outside"), join(dirname(a), "missing"));
  await assert.rejects(
    copySdkDependencyGraph([a], join(root, "store"), join(root, "escaped-sdk")),
    /outside managed store/,
  );
});

test("byte-identical ONNX dylib aliases share one package-local binary while preserving the loader path", async (t) => {
  const { root, packagePath, write } = fixture(t);
  const a = packagePath("onnxruntime-node", { version: "1.30.0" });
  const native =
    "store/onnxruntime-node@1/node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64";
  write(`${native}/libonnxruntime.1.30.0.dylib`, "identical native bytes");
  write(`${native}/libonnxruntime.1.dylib`, "identical native bytes");
  const sdk = join(root, "sdk");
  const graph = await copySdkDependencyGraph([a], join(root, "store"), sdk, {
    platform: "darwin",
    arch: "arm64",
  });
  const output = join(
    sdk,
    "node_modules/.pnpm/onnxruntime-node@1/node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64",
  );
  assert.equal(
    realpathSync(join(output, "libonnxruntime.1.dylib")),
    join(output, "libonnxruntime.1.30.0.dylib"),
  );
  assert.equal(graph.removed["duplicate-native"].bytes, 22);
  assert.equal(
    (await auditSdkTree(sdk, { platform: "darwin", arch: "arm64" })).links,
    1,
  );
});

test("the fixed Transformers node bundle keeps its undeclared hoisted ONNX common dependency", async (t) => {
  const { root, packagePath } = fixture(t);
  const hf = packagePath("@huggingface/transformers", { version: "4.3.0" });
  const common = packagePath("onnxruntime-common");
  mkdirSync(join(root, "store/node_modules"), { recursive: true });
  symlinkSync(common, join(root, "store/node_modules/onnxruntime-common"));
  const sdk = join(root, "sdk");
  const graph = await copySdkDependencyGraph([hf], join(root, "store"), sdk);
  const bundled = join(
    sdk,
    "node_modules/.pnpm/@huggingface+transformers@1/node_modules/onnxruntime-common",
  );
  assert.equal(
    realpathSync(bundled),
    join(
      sdk,
      "node_modules/.pnpm/onnxruntime-common@1/node_modules/onnxruntime-common",
    ),
  );
  assert.equal(graph.runtimeAdditions.length, 1);
});

test("the audit rejects foreign binaries, broken and escaping links, and logical byte budget overflow", async (t) => {
  const { root, packagePath, write } = fixture(t);
  const a = packagePath("onnxruntime-node");
  const sdk = join(root, "sdk");
  await copySdkDependencyGraph([a], join(root, "store"), sdk);
  const foreign = write(
    "sdk/node_modules/.pnpm/onnxruntime-node@1/node_modules/onnxruntime-node/bin/napi-v6/foreign/alien/binding.node",
    "foreign native",
  );
  await assert.rejects(auditSdkTree(sdk), /Unexpected SDK distribution file/);
  rmSync(join(dirname(dirname(foreign)), ".."), { recursive: true });
  const link = join(sdk, "bad-link");
  symlinkSync("missing", link);
  await assert.rejects(auditSdkTree(sdk), /ENOENT/);
  rmSync(link);
  symlinkSync(a, link);
  await assert.rejects(auditSdkTree(sdk), /escapes root/);
  rmSync(link);
  const large = write("sdk/sparse.bin", "");
  truncateSync(large, SDK_SIZE_LIMIT + 1);
  await assert.rejects(auditSdkTree(sdk), /exceeds.*budget/);
});
