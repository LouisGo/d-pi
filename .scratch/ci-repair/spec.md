# 最新 CI 失败修复

2026-10-02，基线 `7ae6962c5f6e6903964f429d5d5f904b99d18c08`。

## 推进与交接

- 授权：用户要求检查相关 CI 脚本、找到根因并修复；随后明确以最近一次 Action 为主，检查后 commit。当前范围为工程验证工具与测试，不改变产品行为。未授权 push。
- 验收基准：[macOS arm64 checks #11](https://github.com/LouisGo/d-pi/actions/runs/36952368172)，job `110667874543`。日志错误摘录见 [远端证据](evidence/remote-failures.json)。
- 工程状态：两个最新失败点已修复，干净 checkout 的完整检查、SDK 行为验证和构建通过。
- 产品待决：无。无新 GUI 交付或用户体验验收。
- 交付：本地验证完成并按用户要求 commit；远端新一轮 Actions 结果须在后续 push 后核实。

## 根因与修复

### 配置共享 fixture 使用了错误的依赖根目录

#11 的安装、SDK 准备、环境检查、SDK 行为验证及完整检查中的静态门禁均通过；失败之一为 `@oh-my-pi/pi-ai/auth-storage` 无法解析。

`configuration-sharing.integration.test.ts` 设置 `D_PI_CONFIGURATION_SOURCE=1`；此前 `validation/m2/configuration-sharing.mjs` 把 adapter 的 `node_modules` 指向项目顶层。pnpm 干净安装在该层只公开直接依赖 `pi-coding-agent` 与 `pi-utils`，fixture 需要的 `pi-ai`、`pi-catalog` 属于 coding-agent 的传递依赖。本机该层多出这些包，掩盖了问题。

修复为从真实 `pi-coding-agent` 包路径解析其相邻 `node_modules`，与原生 CLI 使用同一固定依赖图。prepared SDK 模式继续使用 SDK 自身依赖目录。

新建独立 clone 并 frozen install 后，原测试 [红灯](evidence/configuration-red.txt) 复现远端相同缺模块错误；修复后 [绿灯](evidence/configuration-green.txt) 完成 live WAL、只读源文件检查、双向凭据及模型复用、实际 CLI RPC 模型读取。全部为隔离 fixture，真实供应商请求数为零。

### SQLite 故障注入测试的默认时间预算不足

#11 第二个失败为 Host 丢失后恢复测试超过 Vitest 默认 5000ms。该测试持有真实 SQLite `BEGIN IMMEDIATE` 写锁，跨 ACK、终态、断连和 Host 退出保持 Main 持久化失败；每次尝试写入受生产 `busy_timeout=250` 约束。

只读计时实验测得 7 次锁等待，每次约 271–289ms，单条测试约 2 秒；慢 runner 上这些串行等待和调度成本可能耗尽默认预算。远端日志没有逐次 SQLite 耗时，具体 runner 开销归因仍是推断，不冒称生产死锁。

仅该测试改用 15000ms 的有界预算，保留生产 SQLite 参数及全局 Vitest 默认。增加锁释放前收据仍为 `dispatching`、无 ACK、结果 `unobserved` 的断言；原有重开后 `unknown`、草稿保留、prompt 只写一次的断言继续执行。

可丢弃 checkout 的压力实验仅把测试 SQLite wait 从 250ms 调为 750ms：5000ms 预算 [失败](evidence/causality-budget-red.txt)，15000ms 预算 [通过](evidence/causality-budget-green.txt)，耗时约 5.6 秒。实验修改未进入提交。真实默认 wait 下，整份 21 条因果测试在 3 worker 配置 [通过](evidence/causality-green.txt)。

## CI 链路核对

- 唯一 workflow 为 `.github/workflows/check.yml`：macOS arm64、固定 Node 文件、packageManager 单源、三个 Action 的 commit SHA、只读权限和冻结安装均有效；本次不改 workflow。
- `check:environment`、SDK 原子准备及真实导入、`validate:sdk`、`check` 的类型/设计/i18n/架构/文档/生成报告/工具测试与隔离行为测试、`build` 沿用现有标准入口。
- 日志中的预期 `FAIL: design lint crashed` 来自门禁负例，其最终测试通过，不能把它当成真实 lint 失败。
- README 的 pnpm 目标更正为已有 `packageManager` 的 12.8.1，不升级工具或改锁文件。
- 历史 #5 结构报告过期、#8 样式 scale 门禁失败在当前提交已解决；其余旧失败用于交叉确认，不作为本次额外改动范围。之前 `a316af6` 的 lockfile 解析修复在 #11 已通过。

## 验证

干净环境目录：`/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-ci-clean-hil45eau`。Node 24.21.0 / pnpm 12.8.1，顶层 OMP 包只有两个直接依赖；不复用本机污染的 node_modules 或 SDK。

- [冻结安装](evidence/clean-install.txt)、Electron 安装、[SDK 准备](evidence/clean-sdk.txt)、[环境检查](evidence/clean-environment.txt)：通过。
- [SDK 行为验证](evidence/clean-validate-sdk.txt)：通过。
- [完整 `pnpm check`](evidence/clean-check.txt) 与 [构建](evidence/clean-build.txt)：通过；Vitest 95 文件、512 测试通过，1 个 CLI artifact opt-in 测试跳过。
- CLI artifact opt-in smoke 按现有配置跳过；不作为本次通过证据。未 push，未声称远端 Action 已变绿。
