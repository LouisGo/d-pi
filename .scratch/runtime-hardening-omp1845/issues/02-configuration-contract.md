# 02 配置身份、只读读取与模型能力修复

Status: resolved
Blocked by: none

范围/授权见 [spec](../spec.md)，接口见 [design](../design.md)。承接 [M2 02](../../m2-first-release/issues/02-configuration-models.md)的三个已确认缺口；关联 D-03/D-04/D-23/D-25/D-35/D-37。

## 目标与修改范围

同一配置场景完整修正 query key→IPC scope→Main 解析→Bun 读取→响应身份；snapshot 与显式认证写入分离；模型能力/选择保真并实际回读。configuration contracts/main/renderer、runtime/configuration.mjs、ModelControls、preload/Main 装配、必要 execution 模型选择合同同批更新。

Main 固定真实 scope/job/source；Thread 仓储提供可信目录；OMP 拥有配置/认证；读适配拥有有限 readonly 文件/数据库句柄并及时 close；UI 不拥有第二套认证或模型规则。身份变更经公开面，机器依赖如实更新。

## TDD 与验收

1. 真实 QueryClient+schema+Main 类：A 发起、资源等待、切 B、完成；A 的 cwd/默认模型仍进入 A，错位响应被拒，删除/重关联 A 不回退 B。application scope、认证旧 job 取消出口也覆盖。
2. 实际 SDK 隔离查询：legacy models.json 与新 YAML 优先级、缺 DB、旧 schema、损坏/符号链接、项目覆盖、无执行信任。查询前后文件集合/哈希/权限/schema 不变，无网络/helper/项目扩展；unsafe 路径返回明确 partial/unavailable。
3. 同版本真实 metadata 四类 effort；默认/off/明确 effort 有不同传输语义，支持 minimal，requiresEffort 不提供 off，不可调模型不提供虚假菜单；应用结果与 Host 实际回读一致。
4. 显式 DeepSeek 保存失败保留旧 key，OpenAI challenge/prompt 与取消释放的已有正确行为回归；日志/DTO 无秘密。不运行真实供应商费用探测。

只读全链的关键未知在本票内先做一个最小样本，不建立全局验证平台。若必须 fork SDK/复制完整认证系统，采用 design 的保守失败分支并记录限制；其它已明确修复继续。源码存在无写 helper 不等于验收已经通过。

M2 来源选择、真实账户认证和子 Agent 模型覆盖仍由原票承接。本票完成不能将原 M2 02 整票标 resolved。

## Comments

2026-10-01：缺陷与目标已核对，待方案审阅及目标 SDK 集成。

2026-10-01：configuration sub agent 已领取；身份 query/IPC/Main、只读适配、模型能力与意图传输已实施，正在目标官方包隔离验证；01 的资源与原生 Host 启动由主 Agent 整合。

## 实施与证据（2026-10-01）

- 按用户后续授权改以官方 18.4.6 为实际目标，升级例外由 01/upgrade 维护。完整切换 scope/trace/source 合同：Main 经 ThreadReader 在 await 前固定并在后复核目标、复制原生环境；query 拒绝 scope/trace 错位；application 使用固定隔离目录；认证续步/取消保留原 job 身份。旧无身份命令由 schema 拒绝。
- TDD 红灯：在独立 `git archive 4d294e0` 对照中，真实 QueryClient+schema+Main 的 A→B 资源等待样本实际 spawn `/B`（期待 `/A`）；实际 ModelControls 给 DeepSeek 六个硬编码档（期待 native default/off/low/high/max）。旧资源 snapshot 实测创建 DB/WAL/SHM 并迁移 JSON。修复后目标样本绿，未把早期工具环境失败算业务红灯。
- 新 SDK 真实红绿：18.4.6 官方 Agent/ModelControls 验证 `setThinkingLevel(undefined)` 不会设置 `disableReasoning`；薄适配改用官方 `ThinkingLevel.Off` 后明确关闭成立。未指定实际值按官方 `Inherit` 回读，default 保留原生有效设置，requiresEffort 与不支持的 effort 明确拒绝。
- 自动化：`node scripts/test.mjs vitest src/modules/configuration/main/native-configuration.test.ts tests/integration/configuration-identity.integration.test.ts src/modules/configuration/renderer/queries.test.ts src/modules/configuration/renderer/settings.test.ts src/app/renderer/model-controls.test.ts`，5 文件 11 测试通过。包含删除/重关联无回退、完成前 target 删除的失败诊断、错误 cwd、query 身份、旧 job cancel、challenge→prompt、原生能力菜单及失效 effort。严格全仓 `tsc --noEmit` 通过；受改文件 Biome 通过。
- `validation/m2/configuration-readonly.mjs` 使用官方 18.4.6 实际模块，13 个隔离样本通过；比较整个临时 root 的文件集合/哈希、文件与目录权限、符号链接目标，无新增 DB、DDL、迁移、helper 或真实供应商请求。覆盖旧 models.json、YAML 优先级、项目覆盖、旧凭据 schema、损坏 DB/缓存、symlink 与 explicit overlay、legacy settings 覆盖缺口。真实源码核对确认原生 OpenCode 会展开任意外部 file/env 引用，补真实红灯后在展开前返回明确 unavailable，并复用官方 SOURCE_PATHS/resolveUserPath 定位来源。`validation/m2/configuration.mjs` 使用原生 DeepSeek 归一化与 GET fixture，401 保存失败保留旧 key，认证后的 snapshot 可读；真实供应商请求为 0。
- `validation/m2/model-capabilities.mjs` 以同版本真实 catalog 的 DeepSeek、minimal、reasoning 无可调档、requiresEffort、非推理五类模型，使用真实 ModelRegistry、ModelControls、Agent 与内存 SessionManager 验证默认/off/effort及实际值。`D_PI_MODEL_HOST_SOURCE=1` 使用当前薄 Host 和实际随包 18.4.6 SDK（唯一授权的 import 修正），真实 `d_pi_model`→`get_state` 五类回读一致、拒绝 requiresEffort off，通过且无供应商请求；主 Agent 最终重备后再复验完整随包文件身份。
- 只读有限边界明确：活动非空 WAL、旧 schema、remote auth、native cached/account catalog 无安全无写 hydration 时返回 partial/unavailable；不声明完整账户目录或计费可用，也不复制原生认证/模型规则。GUI 来源选择、真实 OpenAI/DeepSeek 账户验收与子 Agent 覆盖仍归 M2 原票。

代码、模块合同与必要依赖已完成；最终随包三脚本均通过，见 [configuration-packaged-18.4.6](../evidence/configuration-packaged-18.4.6.json)。本票 resolved，不关闭 M2 真实供应商/来源选择/子 Agent 范围。

### 2026-10-01 用户试用发现的正常共享回归

本票原工程证据仍保留，但将活动 WAL 和已有缓存目录排除出读取的完成边界违反 D-03/D-04。静态 13 样本通过不能证明正常 CLI 登录复用；后续用户已明确要求修复，由 [M2 配置共享修复](../../m2-first-release/configuration-sharing.md)纠正这项限制并把双向正常路径纳入常规门禁。原真实供应商/来源选择/子 Agent 范围没有因本修复完成而关闭。
