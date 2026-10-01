# SDK 资源互斥与 import-only 校验

2026-10-01，macOS arm64，Node 24.21.0；使用真实 Node 子进程和官方安装的 Bun 构建平台校验入口，fixture SDK 根在隔离测试目录，未操作个人 OMP 或凭据。

## 红灯

- 将运行资源 fixture 改为官方 import-only exports 后，`sdk-resource.test.ts` 在正常 admission 处拒绝 `resource-incompatible`，证明原 CommonJS resolver 错拒绝原生 ESM 入口。
- `sdk-preparation.test.mjs` 新增真实 Main 子进程：先 `managedSdkRuntime` 完成验证，等待但不启动 Bun。旧 prepare 此时退出 0，断言 `prepare replaced resources after Main validation, before native spawn` 失败。前一次构建路径错误不计为红灯。

## 绿灯与范围

`node scripts/test.mjs node tests/tooling/sdk-preparation.test.mjs tests/tooling/environment-gate.test.mjs`：8/8，包含旧链接、重复准备、空根、复制失败保留旧根、活跃旧原生进程、修改源拒绝、资源互斥。

同一资源互斥样本证实：

- Main 在资源目录只读（0500）的情况下验证成功，且 HOME/TMPDIR 与 prepare 不同。
- Main 验证后持有守卫时 prepare 拒绝，已发布 manifest 保持相同。
- 真实 SIGKILL Main 后 prepare 成功，内核释放所有权，旧 PID/birth 记录不妨碍重新获取。
- prepare 在真实 build 子进程处持有守卫时，另一真实 Node 首次资源校验被拒绝；prepare 正常结束后释放。

`node scripts/test.mjs vitest src/platform/omp/resources/sdk-resource.test.ts`：1/1；import-only 正常准入、包版本/名称错配、launcher/sdk.ts 篡改拒绝。真实 Node `inspectSdk` 对当前 18.4.6 随包资源返回 `issues=[]`。

严格 tsc、架构门禁、文档引用及所属七个实现/测试文件 Biome 均通过。守卫未改 launcher 或 SDK 内容；最终随包配置验证的已有三脚本输出仍见 [配置证据](configuration-packaged-18.4.6.json)。

## 所有权与限制

只有管理资源的发布与使用互斥。SQLite 锁库独立于 App/OMP 数据库；Main 从验证前持有连接直到退出，prepare 通过 finally 释放。固定 `/tmp/d-pi-sdk-resource-guards-<uid>` 不依赖 HOME/TMPDIR，0700/0600，资源父目录按真实路径归一化，SDK 根 symlink 拒绝。

每个资源根留下一个小型锁库；运行中不 unlink，防止两个 inode 各自锁定。移动资源目录和自动化临时根会增加文件，只能在所有 d-pi、资源校验与 prepare 进程退出后离线清理整个私有目录。未承诺 Windows，也未建立资源租约、恢复执行、adopt 或外部 OMP CLI 管理。
