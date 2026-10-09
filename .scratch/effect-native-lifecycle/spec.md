# Effect 原生连接生命周期

2026-10-02。基线 `b93971a`。用户明确授权根据所附方案在合适的位置引入 Effect，完成检查后 commit 并 push 全部内容。工作区开始时干净。

```project-status
[{"id":"effect-native-lifecycle","title":"Effect 原生连接生命周期","phase":"基建","engineering":"complete","trial":"not-applicable","acceptance":"not-applicable","evidence":["issues/01-native-lifecycle.md","validation.md","evidence/process-supervision.json"],"next":"NativeSession、SessionHost 与 Main transport 等待已按 owner 接入；后续仅按实际收益维护，不扩张到 Renderer","constraints":"Effect 限定 execution/host 与 execution/main/transport；unknown 不自动重发，冷恢复只读。"}]
```

## 推进与交接

- 交付：锁定 `effect@4.0.0`，NativeSession 内部统一 Scope、Fiber、超时与清理；公开面继续普通 Promise 和原生 DTO。
- 授权：本次用户请求覆盖依赖安装、必要代码/决定/测试/状态记录、commit 与 push；不含公开发行或新产品能力。
- 受影响决定：新增 D-39，将 P-05 中 Effect 的 Host 候选提升为限定范围采纳；沿用 D-02/D-03/D-24/D-29/D-35/D-36/D-37/D-38。
- 范围：NativeSession 的 ready/RPC 等待、关闭时中断、进程释放与超时；门禁限制 Effect 导入位置。SessionHost 证据重送和 Main HostConnection 保留现状，后续按实际替代收益接入。
- 拥有者：NativeSession 持有单原生实例的 Scope；关闭或断链结束在途等待，进程退出与组清理仍提供独立证据。切换 Renderer 不关闭 Scope。
- 重要待决：无。现有 Zod、ts-pattern、Renderer 状态/查询和 OMP 执行所有权保持既定合同。
- 工程：完成；官方 release 与 npm registry 均确认 4.0.0 stable、零外部 runtime 依赖，安装锁定版本和 integrity；Scope 管 ready/RPC Fiber 和进程释放 finalizer，三类手写 timer 与断链逐项 reject 已移除。回归、环境、构建及真实 utility/Bun 故障证据见[验证](validation.md)；不采信附件中未验证的性能数字。
- 试用：本切片为内部可靠性改造，不新增 GUI 体验承诺。

## 验收

通过 NativeSession 公开接口验证注册许可、协议关联、ready/RPC 超时、迟到响应、并发请求限额、故障中断、重复关闭、输出排空与进程组清理；跨 Host/提交回归保持 unknown 不重发。运行完整工程检查与构建，并核实远端 commit。真实账户、计费供应商及用户 GUI 认可不从 fixture 推断。

## 来源与判断

- [官方 4.0.0 release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0) 与 [npm package](https://www.npmjs.com/package/effect)，本机 `pnpm view effect@4.0.0 version dependencies dist.integrity --json`。
- API 以安装的 `effect@4.0.0` 源码为准：`Effect.callback`、`forkIn`、`timeoutOrElse`、`Scope.addFinalizer/close`、`Fiber.join`。不用 v3 API 或 unstable 模块。
- 原生 RPC 的 ID/command Map 是协议关联，不能声称 Effect 能消除；替换的是 Map 内手写 timer、Promise reject 和逐项断链清理。
- 进程 close/groupStopped 证据与运输中断分别保留，不能将 Fiber 中断当作 OMP 执行已取消。

## 任务

- [01 原生生命周期](issues/01-native-lifecycle.md)

## Comments

- 2026-10-09：用户授权修正 Effect 用法、优化并单独 commit，未授权 push。当前基线 `70443c4d`，保留其他 UI/阅读工作区改动。先以正常操作完成后 waiter 残留的失败测试固定缺口，再改为 `ensuring` 全退出清理；同步关闭派发失败遗留 listener/timer、超时后迟到 ready 仍绑定也分别验证红→绿。Main transport 的启动/操作/关闭等待绑定每代连接 Scope，真实进程组清理完成后才结算关闭并关闭 Scope；超时仍保留 unknown，不重发命令。HostScope deadline 将 AbortSignal 传给已运行任务，cancel/close 由任务协作停止；保留 Node ref/unref，不能宣称抢占任意 Promise。相关测试、Main/Host 类型、Biome 与架构边界通过；固定差异的独立双轴评审无新增发现。沿用正确的 NativeSession 用法及 PendingInteractions/原生 bootstrap 的明确 timer owner，本轮不做全层迁移、GUI 或供应商验收。

- 2026-10-02：完整检查确认基线 `b93971a` 的三个 `letter-spacing` 字面量违反已有 token 单源检查；仅将 -0.03em/-0.02em 移入 `tokens.css` 的品牌/标题字距角色，视觉数值、主题和密度保持相同，不放宽门禁。
- 2026-10-02：依赖加入后资源 manifest 的 lockHash 失效，按既有 staging/原子替换流程重新生成 SDK，完整环境核验通过。Effect 编入 utility Host 构建，不加入原生 OMP SDK closure。
- 2026-10-02：第三方许可生成器纳入 Effect MIT 声明，并将图谱说明由 UI 改为 application；故障矩阵增加可选输出路径，保留历史证据原件，当前结果写入本切片。
- 2026-10-02：用户授权以最小引导促进后续使用并 commit/push；在 execution/AGENTS.md 补充适用场景默认用 Effect、Scope 归属、现有样例与简单调用/就地迁移边界，复用既有门禁，不新增 skill、检查体系或运行时代码。
