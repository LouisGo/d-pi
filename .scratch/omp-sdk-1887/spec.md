# 官方 OMP SDK 18.8.7 受控升级

日期：2026-10-10。授权：本次用户请求；目标精确 v18.8.7，不追更。实际起点 main/HEAD/实时 origin/main 均为 `41190889e4b55169f40744b9cabe5b4651675d6f`，开始工作树干净。

## 范围与约束

沿用 D-02/D-21/D-22/D-23/D-24/D-31，官方 SDK＋Bun 1.3.14＋薄 Host＋原生 SessionManager。无 Pi 迁移、原生 fork、执行状态复制、私有导入扩张、App schema 迁移或新产品设置。commit 按日常 main 约定；未获 push/PR 授权。

上游 tag `f261ed9faf16b61880b544f599876bface4ded0d` 经实时 ls-remote 核对；[官方发布](https://github.com/can1357/oh-my-pi/releases/tag/v18.8.7)及 npm 原包已读取。Bun 最低 >=1.3.14，随包保持 1.3.14。

## 最小适配

- OMP 两个直接依赖及锁定同族精确 18.8.7，冻结 pnpm 安装。Bun lock 原有 importer 缺少已落地的 Router/Effect/panels 等声明，本次用固定 Bun lockfile-only 生成同步，未改变这些声明版本或安装器。pnpm 发布年龄例外仅保留所需精确 18.8.7，不使用范围放行。
- 官方 sdk.ts 已改用 prelude-definition。staging 旧补丁删除，prepare/Main/environment/afterPack 均强制新版未修改源的 SHA-256 `d693c1b71e70f61c38c2cf564c608750401179509e8c6c414d1e124baa96e69a` 与固定路径；旧 sdkImportFix 被拒绝。版本、路径、真实资源根、lockHash、平台、启动哈希和独占锁保持强校验。Main 补齐已有 managed-session.mjs 的必需哈希。
- 用户明确选定模型在 createAgentSession 之前以官方 modelPattern 传入，再由既有精确模型与 thinking 验证接入；无明确选择时 `allowSessionModelFallback:false`；SDK 对保存的 role 模型仍可能退回保存的 default，因此冷恢复另按公开返回值 `modelFallbackMessage` 拒绝这次替换。拒绝启动不发布 ready，释放原生资源，不自动重发、不创建替代会话。失败后 OMP dispose 可追加自己的 session_exit，既有正文/模型记录必须保留。
- 排队/停止/继续生产逻辑未修改，真实 SDK 新增 steer 场景确认停止保留队列、较新 Stop 压过 Continue，明确继续一次消费。观测中间 agent_end:false，最终 true，App 已按字段处理。ACK、prompt_result、session_settled 仍独立；工具 ID 不是端到端 exactly-once 保证。
- 只读目录旧的“原生会删除坏缓存行”判断已不适用于新版。改由官方公开 `pi-catalog/model-cache` reader 在同一私有序列化副本判断拒收，继续返回 partial/catalog-cache-rejected，不复制 policy、写源库或扩大 coding-agent 私有导入。
- 阅读/工具身份合并/partial coverage 与默认展开回收生产逻辑未改；复跑最新 main 行为并补真实 18.8.7 JSONL。PDF 转换派生记录的 provenance 更新为真实新版，新旧已有记录均不迁移。

## 资源策略

SDK 650 MiB / App 1000 MiB 门禁不变。版本限定 CLI bundle 裁剪与 Linux baseline-only 规则在核对新版源布局/loader 后限定到 18.8.7；未知版本保留并受体积门禁约束。未将 CLI artifact 当 SDK 资源。ONNX 1.30.0 仅相同哈希 dylib 别名合并；Transformers 4.3.0 继续补锁定 onnxruntime-common 并实测惰性 Node import，无模型下载。保留原生 addon、运行源码/源内声明、原始许可证，包文件盘点另列实际结果；文件存在不替代公开分发法律判断。

## 验证与证据

使用 macOS arm64、隔离 HOME/OMP/App 配置、临时项目与 localhost provider；未访问个人凭据或真实供应商。资源清单见 [resources.json](evidence/resources.json)，实际 SDK 录制见 [队列帧](evidence/sdk-control-18.8.7.frames.jsonl)和[关联帧](evidence/sdk-correlation-18.8.7.frames.jsonl)，汇总结果见 [validation.json](evidence/validation.json)。工程验证与用户试用/认可分开。

| 实际入口 | 结果与边界 |
| --- | --- |
| `pnpm install --frozen-lockfile`；固定 Bun `install --lockfile-only --ignore-scripts` | 通过；两锁保持精确目标，不升级 Bun |
| `pnpm runtime:sdk` | 通过；112 个物理包、官方 factory 与 Transformers 惰性 Node import；现有独占锁曾阻止替换，关闭已知 App 后继续，未放宽锁 |
| `pnpm validate:sdk` | 四项通过；localhost 排队/steer Stop/Continue、竞争、ACK 后失败、工具结果与 settled/关联 |
| `pnpm check:environment` | 48/48 固定依赖、0 issues；Bun 1.3.14、Electron 44.4.5 |
| `pnpm check --maxWorkers=2` | 通过；236 个 Vitest 文件 / 1534 项通过、2 项既有 opt-in 跳过，architecture 40 / tooling 144 项通过。普通 `pnpm check` 曾遇 Vitest worker SIGABRT，不记作通过；限制 worker 不减测试/断言，崩溃原因未证实 |
| `pnpm build`；`pnpm exec electron-builder --mac --dir --config.electronDist=node_modules/electron/dist --config.directories.output=dist/omp-sdk-1887` | 通过；unsigned macOS arm64 目录包，SDK 476.8 / 650 MiB，App 780.3 / 1000 MiB |
| `SDK_ROOT=<最终包>/Contents/Resources/sdk node validation/s3/sdk-cold-resume.mjs` | 通过；空会话 ensureOnDisk、同 file/ID、缺失/default/role/禁用模型拒绝、显式替换、错误身份/cwd/缺文件/空文件拒绝，0 model calls |
| `node validation/m2/package.mjs <最终包> --scenario=sdk-upgrade --working-tree` | 通过；真实 Main/preload/Host，SIGKILL 自有实例后冷恢复，同 Thread/file/ID，真实 JSONL/草稿保留；缺模型失败可读，显式换模型恢复，仅初次 localhost 请求 1 次 |
| `node validation/m2/model-configuration-live.mjs <output.json>`；`node validation/m2/model-capabilities.mjs <output.json>` | 通过；19 项模型指纹/热切换配置检查，五类 thinking/原生实际值与 Host 回读；0 真实供应商请求 |
| `node validation/s3/sdk-upgrade.mjs <output.json>` | 通过；真实新版 native addon/cache/EditStore 与 Kotlin grammar；上游固定 asset 从官方下载，实际 installer 通过 localhost 控制传输，验证大小/哈希 |
| 隔离环境用随包 Bun 运行 `tests/tooling/probe-native-reading.mjs <sdk-root>` | 通过；真实新版 JSONL 1002 记录/12 页/2,250,080 字节、saved/live 同工具身份、partial coverage、tail continuation；0 model requests |
| `pnpm test tests/integration/runtime-causality.integration.test.ts tests/integration/subagent-observation.integration.test.ts` | 24 项通过；真实新版 queued-steer false/true 帧经过生产 SessionHost/Runtime/SQLite，不提前 idle/回收/确认，独立收据与迟到错误；真实子任务取消、显式重新委派、父终态/生命周期 |
| `pnpm test src/platform/omp/resources/sdk-resource.test.ts tests/integration/conversation-history.integration.test.ts src/modules/conversation/host/subagent-observation.test.ts src/modules/conversation/main/native-history.test.ts src/modules/execution/host/session-host.test.ts` | 64 项通过；包含原历史追加/分页失败保留内容与成功 continuation、不丢工具覆盖、Host 生命周期 |
| `pnpm test src/app/renderer/reading/reading-window.test.ts src/app/renderer/reading/conversation-i18n.test.ts` | 11 项通过；默认展开完成子任务离屏回收，用户展开/选区/焦点/预览保护；i18n 测试补齐其实际需要的 DOM 环境 |

最终包位置：`dist/omp-sdk-1887/mac-arm64/d-pi.app`，build id `41190889-dirty-1b0de593`，asar SHA-256 `10c9cf82f9c2e97352fe477aa02fd67c2cc830b8e049dc710b80c8f69e58b30b`。这是本次工作树候选，不冒称提交后另一个构建。149 个原 LICENSE/COPYING/NOTICE 文件逐个保留，4 个原生 addon 与官方安装字节相同；10 个源包本来没有命名许可证文件，清单保留 package 的 license 声明并单列，未伪造授权。

独立只读复核覆盖 Spec/Standards：先发现 role fallback 与实际 intermediate-end App 断言缺口，均以真实包/生产帧消费复现和补测解决，刷新快照复核未发现新的可证问题； reviewer 未代跑包内/全量验证。一次无效参数的 provider GUI 脚本曾误启动其完整流程，已终止本任务创建的实例并恢复其覆盖的旧证据；不计验证结果，未继续运行 GUI 全矩阵。

红灯：新版资源 manifest/CLI 裁剪/旧源变更拒绝测试先失败；真实新版缺保存模型＋显式新选择在原 Host 顺序下抛 Could not restore model；afterPack 旧 sdkImportFix 在新 manifest 下失败。保存的 advisor 模型缺失且 default 仍存在时，原 Host 会静默 ready/exit 0 的真实红灯另在最终包转绿。修复后按同场景复测。子任务观察旧脚本只等 tool_execution_end，未等待父 message_end；修正等待独立终态，未放松最终内容断言。

## 联网与剩余边界

新增语言 grammar 由官方按需下载固定版本 WASM，size/SHA-256 校验、原子 rename、失败退避由 OMP 拥有。上游 timeout 60 秒，未接 caller AbortSignal；不能声称 Stop 可立即取消传输。AST、TTSR、摘要按实际测试分别声明覆盖。未打开 gitGuard/worktree，gitGuard 不构成沙箱。Claude 缓存/OAuth 只读现有接入合同与自动测试，不借本次升级访问真实账户；不宣称所有上游收益已测量。Kotlin AST 的首次下载、缓存后离线、首次离线 missingGrammars 已测；下载未释放时 Stop 已返回成功且 prompt aborted，下载释放后仍安装缓存且无下一次模型请求，记录中的 elapsed 包含人为观察等待，不作为取消延迟性能指标。TTSR、阅读摘要、其他 grammar 未测。EditStore 的 UTF-8 预算逐出旧快照、保留最新与 Unicode/换行恢复已测，完整编辑工具 undo/重放未独立验收；取消后的子任务重试采用用户显式新委派，不冒称 resume_ref/端到端 exactly-once。真实 Claude cache/OAuth token 刷新、个人扩展、其他平台/架构、签名/公证未验证。

## 回滚

先停止 App 并核实全部受管原生进程退出与资源锁释放；保留 App 数据、OMP 配置/agent.db/models.db（包含 WAL/SHM 的一致备份）及所有原生 JSONL/附件。暂停向旧版本写入新版修改过的原始数据。源码/声明/两锁/workspace 精确例外及启动适配作为一个范围恢复到起点，再冻结安装和 runtime:sdk 恢复旧已授权 18.4.6 补丁资源。不要单独降依赖或覆写仍在使用的 SDK。

新版原生模型缓存物化 policy 带 App 版本，旧版可能弃用/重建缓存；不能把缓存兼容当配置/会话兼容。新写的 session_exit、model_change、标题及配置 schema 需用旧版在隔离副本核实可读/可执行：兼容则保留新记录，无法证明则让原件只读，执行使用升级前一致备份并明确指出其后新内容仍保留在原件。不得删除配置、会话或 App 数据、静默选模型、建替代会话。若必须迁移或改原生源码，先提供证据和最小方案另行对齐。
