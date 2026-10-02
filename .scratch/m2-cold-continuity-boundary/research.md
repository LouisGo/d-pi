# 冷恢复执行单写边界核查

2026-10-02。范围：为下一阶段提供固定 SDK 的执行全周期单写证据、最小反例及实施建议；不改变 D-24，不解禁旧 Thread，不改 OMP 或生产源码，不处理已有环境改动。用户授权继续开发不等于允许用未经证实的独占方案恢复旧原生身份。

## 结论

当前 OMP SDK 18.4.6 不能提供已证实的执行全周期独占。源码和真实双进程反例一致：两个活着的 SessionManager 可以打开同一个原生会话，各持旧上下文，先后成功写入。publish lock 保护每次文件写入的临界区，无法阻止两个执行者先以同一个旧上下文执行工具再分别落盘。不能仅移除 App 的只读门槛。

## 源码事实

固定来源为本机已安装的官方 `@oh-my-pi/pi-coding-agent` 18.4.6，以及当前 `resources/sdk/manifest.json` 中的同版本 SDK。仅 `sdk.ts` 有此前授权的导入后缀修正，本次读取的 `session-manager.ts` / `session-storage.ts` 未修改。

- `SessionManager.open`（`src/session/session-manager.ts:3578`）加载文件、探测 cwd、创建 manager、采用 entries；`#setSessionFile`（1851）同样没有持有跨进程执行 lease。
- `peekSessionInit` 的说明（3620）声称 open 获取 single-writer lock；这条注释不能单独作为保证，实际写入路径及实验与“全周期独占”的理解不符。
- `FileSessionStorageWriter.appendSync`（`src/session/session-storage.ts:308`）仅在当前追加周围调用 publish lock。
- `FileSessionStorage.#withPublishLock`（437）先获取 OS gate / publish lock，完成当前同步 task 后删除 lockfile 并 `osGate.release()`；它也保护 check-and-rename。该机制有意义，但保护范围是文件发布/追加。
- 当前 App `RuntimeService.execute`（`src/modules/execution/main/runtime/runtime-service.ts:565`）遇已有 binding 就投影 interrupted / previousSessionReadOnly；`launch`（171）还拒绝已有启动状态。
- `runtime/host.mjs:19` 只使用 `SessionManager.create`，尚无原身份 cold open 接入。
- `ThreadRepository.bindNativeSession`（`src/modules/threads/main/thread-repository.ts:77`）拒绝替换既有 sessionId / sessionFile / configContextId；该真实身份边界应保留。

## 最小实验

问题：A 未关闭同一会话时，B 能否 open 并写入？停止条件：得到一例成功重叠 owner 即足以否定 SDK 自带全周期独占，无需供应商请求或扩大矩阵。

执行：

```sh
node .scratch/m2-cold-continuity-boundary/probe.mjs
```

[脚本](probe.mjs)、[子进程脚本](worker.mjs)、[原始结果](evidence/lock-counterexample.json)。复用项目 allowlist 测试环境，独立 HOME、OMP、App 数据、工作目录、Git 配置；导入 SessionManager 原生类，没有创建 AgentSession、加载用户项目扩展或请求模型。网络/个人凭据路径没有进入实验，供应商请求为 0。

结果：两个子进程 A / B 同时 open 原始 sessionFile 成功；A 写 `live-owner-A` 后仍存活，B 写 `live-owner-B` 成功。磁盘包含两项，二者 parentId 都为 seed；A 内存只有 seed + A，B 内存只有 seed + B。写临界区互斥没有刷新另一 owner 的执行上下文。进程都由实验创建，关闭实验进程不触及用户 App/CLI；临时原生文件保留用于核对。

本样本用 custom entry 验证 owner/write 准入，没有实际执行工具，不宣称复现了业务副作用损坏，也不推断某次暖会话事故的原因。

## 安全实施建议

1. 本轮保留旧 Thread 只读、unknown 不自动重发。不要将 App single-instance lock、SQLite 锁、仅 App 使用的 sidecar lock 或 publish lock 当成 CLI/SDK 全周期协作证明。
2. 原身份恢复需要所有可能执行同一原生会话的入口合作：在读取并采用可执行上下文前取得同一 session lifetime lease；覆盖 CLI/RPC/SDK、别名/真实路径、切换、工具/异步后台活动、最终持久收尾与释放；占用时准确报告且禁止强占。验证至少覆盖双活竞争、死亡后释放、正常关闭后复开、子工具残留和身份未改变。只给 d-pi 加自己的 lease 不能限制官方 CLI。
3. 若用户优先希望退出后承接上下文，可评估官方 `SessionManager.persistCopy`（2173）的真实新原生身份路径。但应显式创建关联的新 Thread，并说明“从历史新建”，保留旧 Thread / 原收据和 unknown；不能把 copy identity 偷换进旧 binding、声称恢复原执行或自动重放未决输入。此处仅源码候选，尚未实验上下文/branch/blobs/model 和收据语义。
4. 两种目标的用户可见含义不同：恢复原身份依赖上游合作和更完整证明；承接到新身份需要产品策略对齐。上述待决仅阻塞对应 cold continue，不阻塞本阶段其他已授权工程。

本记录没有执行全仓 check/build：生产代码未改变，实验已经回答关键未知；不把分析成果登记为冷恢复功能完成或用户认可。

## 工程收口与待决

2026-10-02：[06a 证据票](../m2-first-release/issues/06a-cold-continuity-evidence.md)工程完成，验收仍 pending。结论限于固定 18.4.6 的源码与上述 owner/write 准入反例；未验证未来版本，也未实现 CLI/RPC/SDK 协作 lease。旧 Thread 继续只读，原身份与原提交收据保留。

下一步是对齐显式复制历史到关联新 Thread 的产品语义，再核实官方 persistCopy 对上下文、branch、blobs、模型配置和未决收据的实际边界。此候选尚未获准或实现，不自动恢复执行、不重发 unknown，不替换旧 Thread 的 binding。原身份执行恢复仍须另有覆盖全入口、全周期的单写证据。
