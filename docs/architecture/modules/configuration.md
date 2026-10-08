# 配置、模型与认证

日期：2026-10-08。深度：全部原生 Provider 认证和模型配置无头接入；真实供应商认证及子 Agent Thread 覆盖仍待验收。依据 D-03/D-04/D-23/D-27 及本轮用户扩展授权；[配置 ADR](../../adr/0002-share-native-omp-config.md)、[基础契约 §3](../foundation-contracts.md#3-配置与首版认证b3)。返回[模块地图](README.md)。

## Provider 与模型管理（2026-10-08）

`configuration/contracts/provider-models.ts` 暴露原生登录方法、认证来源、非秘密账户身份、API key 保存/校验差异、模型类型/上下文/费用/角色候选和 revision。目录由 `getAll("all")` 读取；会话可选性另外沿用原生 chat 目录和 `enabledModels` pattern 过滤，不将设备收藏/隐藏误写为原生启用状态。全零费用由官方 `getModelPricingStatus` 区分免费、套餐内、可变和未知价格。`getKnownRoleIds` 与 `getRoleInfo.accepts` 保留原生角色和自定义角色。

全部 `getOAuthProviders` 注册的可用方法通过 `auth.oauth.login` 接入，不复制 OAuth、设备码或 key 校验协议。原生 prompt 的 placeholder/allowEmpty/secret 和手工 callback 输入被保留；未声明 secret 的输入保守遮罩。API-key method 的原生 normalization/validation 原样调用，探针类型明确给 UI；可能产生计费请求的 chat-completions/anthropic-messages 校验不自动运行。无原生登录 method 但支持静态 key 的 provider 使用 `credentials.upsert` 保存，回执只表示原生保存，不冒称联网校验通过。移除账户按 `removeById(provider,id)`，保留同 provider 其他账户，env/config 来源仍可生效。

原生共享写操作 `provider-enable`、`set-model-role` 和账户删除携带 `expectedRevision`；打开 writable storage 前检查路径/原生 schema，写前复核、写后回读。角色写入显式选择 global/project；application scope 不允许伪造项目角色。`Settings.loadIsolated`、`cfgDisabledProviders.setMember` 和原生 role setter 负责持久化。自定义模型在原生优先文件 models.yml/yaml/json 上复用 `ModelsConfigFile.schema` 与 `validateProviderConfiguration` 校验，按 revision/原文 CAS 后原子替换；只合并目标记录的传入字段，保留未知兄弟、headers 和凭据字段，Renderer 摘要不回传它们。原生没有公开 CRUD writer，文件适配不使用临时 `registerProvider` 冒充持久化。CAS 不提供外部 CLI 的进程间锁；发现冲突要求刷新后重做。

显式 `refresh-catalog` 才调用官方在线 discovery；读取目录使用官方 `hydrateCredentialScopedModelCaches` 的离线路径和私有缓存副本，不刷新 token、不联网、不执行 `!command`。显式刷新也拒绝命令型 key/headers，不借目录刷新执行 credential helper。无法观察账户缓存时保留 partial/unknown。Main 的 URL 只来自原 job 的原生 challenge，允许无 userinfo 的 HTTPS 或 HTTP loopback；Perplexity 采用原生 email 回退，没有另建 Electron cookie/SSO 机制。证据见[原生能力调查与验证](../../../.scratch/providers-models/native-capabilities.md)。

## 当前工程落点（配置加固，2026-10-01）

- OMP profile 复用发生在 `runtime/host.mjs` 的 `resolveProfileEnv`/`setProfile`；随包资源与固定版本清单在 `src/platform/omp/resources/`。
- 执行侧配置上下文 `configContextId` 由 `src/modules/execution/main/runtime/runtime-service.ts` 按规范化目录与环境派生，不是第二份原生配置。
- App 自有的主题、密度与 locale 偏好归 `src/modules/preferences/`，该模块不拥有 OMP 配置。
- M2 入口由 `src/modules/configuration/` 接入；query key、IPC、Main 与 Bun 响应使用同一 scope/trace。Main 经 `threads/contracts/public.ts` 解析并复核目录，固定原生环境；application 使用独立探测目录。A 的异步读取不随活动 Thread 改为 B，删除或重关联返回 `stale-target`，错位回复不进入成功缓存。
- `runtime/configuration.mjs` 在短生命周期包内 Bun 中区分只读 snapshot 和显式认证写入。snapshot 的 `configuration-readonly.mjs` 复用官方 `Settings.loadReadOnly`、AuthStorage 的内存凭据投影与 ModelRegistry 的私有临时缓存快照；本地文件/SQLite 事务有限、只读且关闭；正常 WAL 的已提交内容直接读取，原生 WAL/SHM 协调文件允许管理，不 checkpoint，缓存源通过 serialize 一致快照交给官方代码并在退出时清理临时库，不启动项目 Agent，不运行命令 key/helper、不联网、迁移或修复用户文件。原生 credential schema 8 经版本检查；不兼容、损坏、symlink、锁超时、remote auth、未观察账户目录以覆盖缺口返回，unknown 不冒称无认证。官方认证/合并规则仍由 OMP 拥有。
- OpenAI 原生 OAuth、DeepSeek 原生 key 登录的 GUI 接入已实现，真实供应商尚未验收。认证 job 固定原 scope/source；answer/cancel/open-login 仅经 jobId 续接，Thread 切换或删除不丢失旧 job 的取消出口。保存成功仅使摘要查询失效，不重试认证副作用。
- DeepSeek 使用原生 models-endpoint GET 校验后原子保存；失败保留旧凭据。隔离 fixture 已覆盖归一化、拒绝与旧凭据保护。凭据不进 argv、App 数据或诊断。
- 当前 Thread 主模型/档位使用原生实例 `setModelTemporary`，不修改共享默认值；启动前选择通过本实例环境带入，启动后空闲时经 Host 控制更新，显示原生回读。能力直接派生自 18.4.6 metadata/helper，包含 minimal、不可调档与 requiresEffort；GUI 默认/off/effort 传输意图独立。官方 `ThinkingLevel.Off` 关闭 provider reasoning，未指定实际值保留为 `inherit`；失效 effort 拒绝或要求刷新，不能显示为成功。子 Agent Thread 覆盖尚未接入。

## 范围与拥有者

复用 OMP 原生配置读取、合并、认证与保存。配置模块负责桌面接入和摘要，不维护第二套模型目录、默认值或凭据库。App 窗口偏好属于 App 存储，项目执行信任与文件授权属于 [Thread](threads.md)。

Main 管非会话查询/认证接入的生命周期；涉及当前会话的能力经 Host 使用同一配置上下文。原生 CLI、RPC 或短生命周期薄桥接按已验证能力接入，不预先建设常驻配置服务。具体入口受固定版本证据约束。

本轮身份、只读文件不变与模型能力证据见[配置加固票](../../../.scratch/runtime-hardening-omp1845/issues/02-configuration-contract.md)。Query 只采样摘要，`networkMode: "always"`、`retry: 0`；认证和模型变更为显式命令。当前没有 GUI 配置来源切换，不编造来源 generation；以后由 M2 来源选择接入真实来源身份并使旧缓存失效。

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

原 M2 两入口限制于 2026-10-08 被用户明确扩展授权取代：全部 OMP 原生注册 provider 认证均可接入。OpenAI 账户（openai-codex）和 OpenAI API key 仍是不同入口。原生实现管 token/刷新/持久化，GUI 只提供受控输入和进度；OAuth 使用系统浏览器，不依赖[内置浏览器](browser.md)。API key 不进 argv、日志或 App 数据库。

认证结束/取消释放临时桥接与监听；保存失败不先删除已有有效配置。不兼容格式停止写入。需要 Runtime 长期 fork 才能接入时，报告证据及影响，不能自行改变登录路线。

## 第一批交付与验证

M1：在隔离配置中发现可用模型，使用同一上下文启动并完成一次请求；覆盖 Finder/终端环境差异、无模型、配置不可读。复用[Settings 证据](../../validation/settings-feasibility.md)，不把它当成 GUI OAuth 已验证。

M2：验证子 Agent 默认配置与当前 Thread 覆盖在并行会话、取消覆盖及恢复路径中的实际生效，合理默认映射依据实际可用模型制定，自动降档/调整确认/倒计时后置。另验证两条原生认证桥接、取消/超时/无网络、重启与刷新、旧配置保护；认证受阻仅阻塞该切片和 M2 完整验收。测试使用隔离样本；真实账户路径按实际授权手工验收，不用无提示计费请求充当探针。

2026-10-01 用户报告的 CLI 登录复用回归及两向验证见 [M2 配置复用修复](../../../.scratch/m2-first-release/configuration-sharing.md)；原 WAL 保守失败限制已被纠正，传输完成但覆盖不全的 snapshot 记录 unknown 和有界原因码，不再只记 confirmed。

官方 ModelRegistry 因 JSON、版本或 materialization policy 拒收私有副本中的源缓存行时，snapshot 标记 partial / catalog-cache-rejected；不复制兼容规则，不修复源库，也不把目录缺口解释为认证失效。回归及准入证据见[七提交审查](../../../.scratch/review-seven-commits/spec.md)。

2026-10-01 Renderer 内部整理：`settings/` 分离查询摘要、认证 hook 和进度呈现；父视图保持 hook 挂载，折叠不取消认证、续步按原 jobId，环境公开入口不变。
