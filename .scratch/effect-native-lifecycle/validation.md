# 验证记录

2026-10-02，macOS arm64。基线 `b93971a`；Node 24.21.0、pnpm 12.8.1、Effect 4.0.0、Electron 44.4.5（内嵌 Node 24.21.0）、Bun 1.3.14、OMP SDK 18.4.6。

## 行为与门禁

- TDD：关闭开始立即结束 RPC 等待测试原实现 `settled=false` 失败，实现后通过；进程尚活时不能提前发 exited，完整 close Promise 重入复用，关闭后阻止新的 request/write。
- 回归：NativeSession 8 项测试通过，包含真实子进程/组内工具心跳、bootstrap 登记许可、协议 v2/command 关联、断链与独立 close 证据、ready 超时释放、64 并发预算及超时释放、迟到回复不重发、输入字节预算异常保留。假时钟只在 deadline 边界；子进程与协议真实运行。
- TDD：Effect 导入门禁原实现允许 main/runtime 导入而失败；新增机器清单规则后通过。只允许 execution/host 和 execution/main/transport；禁止 effect/unstable 与 @effect 扩展包。
- TDD：删除 Effect 或改为 v3/RC 的依赖门禁先失败，纳入 D-39 后通过；保留精确版本与 lockfile 一致性检查。
- `pnpm check`：503 行为测试、34 架构测试、50 tooling 测试通过；严格类型、Biome、设计/i18n/文档/状态/源码边界和结构新鲜度通过。唯一跳过项是既有 opt-in CLI artifact native smoke，不冒称该旧 artifact 已复测。
- `pnpm build` 通过；Effect 代码编入 `out/main/session-host.js`，没有外部 effect import/require 或 Renderer 接入。现有 Zod PURE 注释及 Renderer 大 chunk 提示仍存在，未放宽阈值。
- `pnpm runtime:sdk` 与 `pnpm check:environment` 通过，manifest 匹配新锁文件；Effect 没有进入 SDK 原生依赖图。
- 上一提交的 3 个标题字距值集中到 token 后，原 `source-boundaries` 检查通过，Impeccable detector 返回 `[]`；数值和实际继承关系相同，此处没有新 GUI 视觉设计或体验认可。

## 真实原生进程故障

执行：`node validation/s3/process-supervision.mjs .scratch/effect-native-lifecycle/evidence/process-supervision.json`。结果：[原生矩阵](evidence/process-supervision.json)。这是当前源码经 Bun 构建的 Electron utility/Bun/官方 SDK 接入，不是仅 mock NativeSession。

1. 正常 idle：两 scope 原生进程停止。
2. Bun busy 崩溃：对应原生与工具死亡、心跳停止，另一个 scope 继续；持久 ACK 内容保留。
3. Host interaction 崩溃：所属两 scope 原生与工具死亡，待答/执行不确定性与收据可读。
4. Main background 崩溃：组内工具停止，收据保留，冷恢复只读。
5. SQLite 写锁：无法写 App DB 时仍能停止实际原生 streaming，ACK 与原生历史可读。

范围限制：此矩阵使用隔离配置、原生扩展及 localhost fixture，无个人凭据或外部 provider 调用。组外逃逸进程不在已证终止范围；不是工具沙箱、真实供应商验收、完整 GUI 用户认可或公开发布。SessionHost 的证据重送和 Main HostConnection 尚未 Effect 化，当前协议/持久化所有权保持既定边界。
