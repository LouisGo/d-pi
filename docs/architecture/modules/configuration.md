# 配置、模型与认证

日期：2026-09-27。深度：M1 配置复用设计；M2 两条认证与子 Agent Thread 覆盖接入待验证。依据 D-03/D-04/D-23/D-27；[配置 ADR](../../adr/0002-share-native-omp-config.md)、[基础契约 §3](../foundation-contracts.md#3-配置与首版认证b3)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- OMP profile 复用发生在 `runtime/host.mjs` 的 `resolveProfileEnv`/`setProfile`；随包资源与固定版本清单在 `src/platform/omp/resources/`。
- 执行侧配置上下文 `configContextId` 由 `src/modules/execution/main/runtime-service.ts` 按规范化目录与环境派生，不是第二份原生配置。
- App 自有的主题、密度与 locale 偏好归 `src/modules/preferences/`，该模块不拥有 OMP 配置。
- D-23 的两条 GUI 认证入口（OpenAI 账户、DeepSeek API key）尚未实现，本页其余部分仍是设计合同而非已交付能力。

## 范围与拥有者

复用 OMP 原生配置读取、合并、认证与保存。配置模块负责桌面接入和摘要，不维护第二套模型目录、默认值或凭据库。App 窗口偏好属于 App 存储，项目执行信任与文件授权属于 [Thread](threads.md)。

Main 管非会话查询/认证接入的生命周期；涉及当前会话的能力经 Host 使用同一配置上下文。原生 CLI、RPC 或短生命周期薄桥接按已验证能力接入，不预先建设常驻配置服务。具体入口受固定版本证据约束。

## 交接

| 提供给谁 | 数据或操作 | 约束 |
| --- | --- | --- |
| Thread / [宿主](runtime-host.md) | configContextId、来源摘要、可用性、必要运行环境 | 同一任务的读取、认证和启动使用一致配置根/profile/cwd；不向 Renderer 回传原生凭据或秘密环境值 |
| [输入](input-context.md) / [执行](execution.md) | 模型、思考档位、实际可用能力 | 区分配置默认值和运行实例值；编码/模态约束还须由 Runtime 适配验证 |
| 设置/初始化视图 | 读取、按作用域保存、认证进度与可执行下一步 | 不靠文案驱动逻辑，不以模型出现在列表中证明请求可用 |
| M2 子 Agent 设置 | 合理默认配置与当前 Thread 的模型/档位覆盖 | 后续 spawn 生效，必须验证 Thread 隔离；不把主会话 RPC 当作子 Agent 热切换接口 |

保存设置前重读受影响内容，检测外部变化，保存后回读。App 内串行不能保证外部 CLI 互斥；发现冲突要求刷新后重新操作。

2026-09-27 用户确认：会话内对子 Agent 模型/档位的后续配置默认仅作用于当前 Thread。原生默认配置与该 Thread 的显式覆盖必须区分；不能通过改写共享 task.agentModelOverrides 再改回的方式模拟隔离，也不能仅靠提示词宣称已强制生效。既有 Settings 实验只证明同一会话的后续 spawn 会读取变更，未证明两个并行 Thread 可各自覆盖而互不影响。对应切片须核实原生实例/调用级接入、实际生效配置及 Thread 恢复行为；不复制原生完整配置或凭据库。项目/全局写入继续要求明确作用域。成熟产品策略参考见[访谈第十五轮](../../../.scratch/pre-coding-interview/spec.md#第十五轮子-agent-配置作用于当前-thread已确认)。

## 生命周期与失败

已有可用配置直接进入。分别表达缺失、不完整、不兼容和不可访问，Finder 环境差异可由 GUI 选择/修复来源，不自动运行 shell startup 文件或重置原生配置。

仅浏览时只使用不加载项目可执行代码的检查路径；某项查询需要启动项目 Agent/扩展时，先明确执行准入，不为“检查是否可用”绕过项目信任。

M2 新增认证仅 OpenAI 账户（openai-codex）和 DeepSeek API key；其他已有可用 provider 仍复用。原生实现管 token/刷新/持久化，GUI 只提供受控输入和进度；OAuth 使用系统浏览器，不依赖[内置浏览器](browser.md)。API key 不进 argv、日志或 App 数据库。

认证结束/取消释放临时桥接与监听；保存失败不先删除已有有效配置。不兼容格式停止写入。需要 Runtime 长期 fork 才能接入时，报告证据及影响，不能自行改变登录路线。

## 第一批交付与验证

M1：在隔离配置中发现可用模型，使用同一上下文启动并完成一次请求；覆盖 Finder/终端环境差异、无模型、配置不可读。复用[Settings 证据](../../validation/settings-feasibility.md)，不把它当成 GUI OAuth 已验证。

M2：验证子 Agent 默认配置与当前 Thread 覆盖在并行会话、取消覆盖及恢复路径中的实际生效，合理默认映射依据实际可用模型制定，自动降档/调整确认/倒计时后置。另验证两条原生认证桥接、取消/超时/无网络、重启与刷新、旧配置保护；认证受阻仅阻塞该切片和 M2 完整验收。测试使用隔离样本；真实账户路径按实际授权手工验收，不用无提示计费请求充当探针。
