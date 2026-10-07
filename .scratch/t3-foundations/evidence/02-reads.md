# 02 Files / Git 读取资源实施证据

2026-10-07。worker 固定基点 `851d3e59aa4782266a50a7e55bb63048ec5459dc`，工作树 `/Users/louistation/.codex/worktrees/t3-reads/d-pi`，分支 `codex/t3-reads`。本证据不更新 spec、任务状态、聚合看板或生成结构快照；集成与最终独立复核归主 Agent。

## 固定来源与采用范围

T3 固定源码 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631`：`packages/client-runtime/src/state/runtime.ts` 的 query caller signal 与 `runPromiseExit`；对应 runtime tests 的共享订阅/最后释放；`apps/server/src/vcs/VcsProcess.ts` 的真实进程许可、输出预算和 typed failure；`apps/server/src/processRunner.ts` 的 Scope、流收束与 child close。独立研究及原 DOCX 分析由所属 research 保存。

本票吸收“等待方取消继续到真实资源”“许可计数实际活跃子进程”“完整机器结果或失败”“可信 caller 关联”，沿用现有 TanStack Query、Zod v4、ts-pattern。新 runner 是普通 TypeScript 的 scoped finally；不迁移 Atom、全局 Layer、unstable Effect、Git 写、自动刷新，未复制上游并发与缓存常量。

## 最终合同与所有权

- FileRequest / GitRequest 每次 queryFn invocation 加 UUID `operationId` 和同次 `traceId`，不进入资源 key。桥接返回 strict `completed(reply)` / `cancelled` / `failed(error)`；failure 只含有限 code、retryable、main/unknown attribution 和两个 identity。cancel 只带两个 identity，没有 AbortSignal/PID/path/Thread 输入。
- Renderer 消费 Query signal，preload 校验形状及两种返回 identity。shared observer 由 Query 拥有，一个离开不取消剩余读者，最后离开才发送 cancel。取消保持 AbortError，不包装成采样失败。Query 最多重试3次，且必须 code 属于 timeout/io/output-read/process-exit 并明确 retryable；busy/无效源/owner/坏机器输出/未知失败不重试。
- Main 在首个 await 前登记可信 sender/frame、原 request 与 controller/终止 promise；active ThreadContext 在无 await 的 start gate 捕获。Git 每次 queued spawn 前再次核对可信源、原 Thread/工作目录身份。cancel 不要求旧 Thread 仍 active；跨 sender/frame/trace 不能取消，在途重复 operationId 不能再次执行。终态后释放登记，不保留无界 tombstone；已终态 cancel 是幂等 ack。
- Application 持有一个 ProjectReadOperations 和一个 ProjectGitReader；主 frame 导航、窗口关闭、Renderer gone 释放所属 sender；Quit 同时取消/等待 read registry 和 shared runner。
- Main 每 sender16 / 全应用32个 operation，计数含 queue/停止中；整体30s deadline 到期先 abort，仍等待资源 finally 才结算 timeout。Git active4、queue32、每命令10s、TERM 后500ms未 close 则 KILL；active permit 在真实 close 后释放。queue 取消/身份失效不 spawn；close 幂等并拒绝新采样。每个 Git attempt finally 取消并等待 Promise.all 的其他兄弟命令，不能在一支失败后发布终态、遗留其他子进程。
- Files 在 syscall 前后和每64KiB块之间检查 signal，finally 关闭真实 FileHandle；不声称抢占不可取消 syscall。目录改为 opendir 流式维护 sorted top500，完整遍历排序保持；scan50,000条、名称4MiB UTF-8、5s达限明确 truncated，目录路径/inode/dev/mtime复核后才能发布。
- Git raw stdout config keys1MiB、status4MiB、body5MiB+既有缓冲余量；stderr64KiB。超限不会解析部分成功。config 用 NUL name-only 格式并 fail closed；status/rename、HEAD、size、stage/tree 和路径严格 UTF-8/完整记录检查。失败 probe 不误报无 HEAD/changed，保护 config 失败不启动 diff。真实双采样、来源、SHA-256、symlink/FIFO、filter/fsmonitor/external-diff/textconv防护保持。
- 诊断 received/requestId 使用实际 operationId，终态安全 code；未知程序异常保持 failed/unknown，不带原始 stderr/stdout/path/args/cause。未改诊断 schema/writer。

## 实际 TDD 红绿

第一组对旧路径加入 shared observer 最后释放、捕获后取消、runner/registry/新 preload envelope 测试：旧查询未传 signal、operationId 缺失且无 cancel；Files 在 afterRead abort 后仍返回 text；新 runner/registry 入口尚不存在；旧 preload 把新 envelope 当业务 Reply 导致 union 验证失败。随后实现对应合同，逐组转绿。新增物理 TERM/KILL、overflow、timeout、deadline、source/duplicate/release 样本验证实现，不伪称这些已有正确行为先失败。

后续有可直接复核的行为红绿：

1. `pnpm test src/modules/files/renderer/queries.test.ts`，14:55:33，16 tests，3 failed /13 passed。busy、malformed-output、failed 被错误 peer 标 retryable 后，断言 `identities.length === 1` 实际为4。收紧 code allowlist 后 Files16+Git7全部通过；新 retry attempt 的 operationId 不同。
2. `pnpm test src/modules/changes/main/project-git.integrity.test.ts`，14:56:33，7 tests，2 failed/5 passed。失败 repository probe 解析成 `unavailable("failed")`；缺结尾 NUL 的 stage 记录仍解析成完整 diff。修复后7通过。config failure/缺NUL/非法UTF-8、路径记录缺NUL/非法UTF-8已有正确行为作为回归。

3. `pnpm test src/modules/files/main/project-files.test.ts`，15:10:37，8 tests，1 failed/7 passed。未知 afterRead callback defect 被包装成 retryable io。仅系统 errno 才映射 io，未知程序异常原样留在私有 cause 路径并由 Main归因unknown；修复后 Files、OS fd、链路3 files/11 tests通过。

红灯是目标行为缺口；不把 test 参数输错、架构测试初次放错 process 目录或已有回归冒充 TDD 证据。

## 真实资源前后样本

环境：macOS arm64，Node v24.21.0，Apple Git2.50.1 (155)，pnpm12.8.1。样本在测试隔离临时 HOME/OMP/Git 配置下运行，不读取个人仓库或凭据。benchmark 的 before 与 after 使用相同 `git status --porcelain=v1 -z --untracked-files=all` argv、24并发请求、200个文件；before 使用原 execFile 的10s/5MiB模式，after 使用生产 GitReadRunner。它测量真实 child/输出资源接缝，未假称完整应用导航耗时或完整 list/diff 的吞吐。

首次独立运行（14:51:34）原始安全输出：

```json
{"commands":24,"files":200,"before":{"peakActive":24,"durationMs":69.43375000000003},"after":{"active":0,"queued":0,"peakActive":4,"peakQueued":20,"spawned":24,"durationMs":118.84920900000003},"equalOutput":true}
{"beforeFullDurationMs":286.208166,"cancelToCloseMs":1.737792000000013,"remainingChildren":0}
```

并行完整受影响矩阵运行（15:01:23）原始安全输出：

```json
{"commands":24,"files":200,"before":{"peakActive":24,"durationMs":173.43875000000003},"after":{"active":0,"queued":0,"peakActive":4,"peakQueued":20,"spawned":24,"durationMs":214.69491599999992},"equalOutput":true}
{"beforeFullDurationMs":296.8074580000001,"cancelToCloseMs":2.3277499999999236,"remainingChildren":0}
```

最终矩阵运行（15:06:13）原始安全输出：

```json
{"commands":24,"files":200,"before":{"peakActive":24,"durationMs":115.27270799999997},"after":{"active":0,"queued":0,"peakActive":4,"peakQueued":20,"spawned":24,"durationMs":199.281833},"equalOutput":true}
{"beforeFullDurationMs":293.589208,"cancelToCloseMs":3.179292000000032,"remainingChildren":0}
{"captures":3,"bytesPerCapture":3145728,"openDescriptorCounts":[0,1,0,1,0,1,0],"remainingHandles":0}
```

取消耗时样本用真实 Node child 在“ready后固定存活250ms”的外部过程接缝，before 等自然完成，after 由生产 runner cancel 并等 close；它证明取消收束，不冒称真实大型 Git 操作总耗时。FileHandle 样本用真实3MiB文件及 macOS `lsof`，在 afterRead 回调内观察1个 open fd，再 abort；三次 finally 后均为0。

观察结论：真实活跃进程上界从24降至4（减少83.3%），输出逐字节一致，active/queued/fd无残留，已失效的等待可以很快收束。有限排队使该突发完成时间增加；不能宣称普遍延迟加速。当前4/32/16/32为保守初始工程预算，应由真实应用负载继续评估。

## 链路与释放验证

`tests/integration/project-reads.integration.test.ts` 使用实际 QueryObserver、Renderer helper、preload bridge、Main IPC handler、SQLite与File读取；Git外部spawn换成真实可观察 Node child。共享两个 observer 的一次 operation，第一退出无 cancel，active Thread切换后最后退出仍取消原 operation；cancel wire只含2字段；物理 close、Main registry和runner均归零。

第二个组合样本：整体 operation deadline200ms，真实 child 注册 TERM忽略，runner100ms grace KILL。abort 后 registry.size/runner.active仍为1；实际 close 后才收到 typed timeout，随后均为0。另有 active2/queue2容量、排队取消不spawn、queued身份失效不spawn、TERM忽略、byte overflow、command timeout、sender/frame/trace保护、重复start、source释放与close后拒绝验证。

## 最终检查

- `pnpm install --frozen-lockfile`、`pnpm exec install-electron`、`pnpm runtime:sdk`完成；SDK18.4.6/112 dependency units，Bun1.3.14。`pnpm check:environment`核对48/48精确依赖、Electron44.4.5/Node24.21.0、darwin-arm64、SDK哈希，0 issues。
- 15:06:13 affected矩阵：19 files，140 passed /1 skipped（141）；跳过的是既有 `D_PI_REFERENCE_BENCH=1` opt-in项目引用索引大样本，与本票新resource benchmark不同。本票所有新增资源样本均实际执行。
- 未知callback补测后仅针对变化重新运行Files、OS fd和整链集成；11 tests全部通过，不重跑无关矩阵。
- `pnpm typecheck`：根、core、renderer、main、host、preload全部通过。
- `pnpm lint`：547 files，无fix；`pnpm check:architecture`：391 source files；`pnpm check:documentation`：291 Markdown；`pnpm test:architecture`：35 passed。architecture负例测试输出故意模拟的 killed/missing lint 工具，由测试断言作为正确失败处理，不是环境crash。
- `pnpm build`：Main/preload/Renderer通过；已有Zod PURE注释及大chunk提示保留，未改成隐藏警告。
- `git diff --check`通过。

必要旧wire fixture适配：workbench/file-opening.test.ts、workbench/refresh-state.test.ts、shell/appearance-subscriptions.test.ts、validation/m2/rendering.tsx；仅测试/验证bridge样本变化，未修改workbench生产实现。跨process组合测试放既有 tests/integration，未放宽architecture process门禁。

本worker未跑整个 `pnpm check`，未更新主Agent拥有的生成structure/status；主Agent在串行合并后刷新及运行完整矩阵。CLI artifact native opt-in smoke默认跳过；本票没有供应商、执行重发、GUI用户认可或跨平台声明。不可取消kernel syscall、native contextBridge真实窗口重载路径及用户体验仍须与组合试用区分；DTO与IPC链自动化不是完整原生GUI确认。
