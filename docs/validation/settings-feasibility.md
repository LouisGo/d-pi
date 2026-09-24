# 子 Agent 配置与原生 Settings 接口验证

日期：2026-09-24；OMP 18.3.0。接续 [Runtime 可行性验证](runtime-feasibility.md)。用户进一步明确：需要 GUI 配置子 Agent 的模型/思考档位，由主 Agent 正常调度；指定运行实例的停止、恢复、热切换不属于当前要求。

后续配置归属已确定：参考 OpenCode，默认共享 OMP 原生配置，App 自有偏好分离，见 [ADR-0002](../adr/0002-share-native-omp-config.md)。本轮临时隔离目录是测试措施，不是产品默认策略。

## 结论

**当前要求可行，无需为了这些功能修改 OMP Runtime。**

可以用 GUI 提供设置表单，由 Host 调用原生 `omp config ... --json` 读取和保存配置。按 Agent 类型/定义名称设置 `task.agentModelOverrides` 后，同一个仍运行的主会话在下一次创建对应子 Agent 时采用新配置。不是针对某个已运行实例热切换，也不需要 GUI 代替主 Agent 调度。

## 实测证据

复用上一轮隔离配置、临时项目和 localhost 固定模型传输，只新增 6 项检查，全部通过。真实 OMP、真实 task 子 Agent；不使用个人凭据，不产生真实提供商费用，不改正式 UI。

| 检查 | 实际结果 |
| --- | --- |
| 原生设置目录及模型选项 | `config list --json` 返回 503 个设置项；RPC 返回模型列表及当前模型的思考档位。 |
| 无覆盖时的 Agent 配置 | `probe-low` 定义配置为 `probe/probe:low`，真实子 Agent 使用 `probe/probe`、`low`。 |
| GUI 等价的外部配置写入 | 原生 CLI 将 `probe-low` 覆盖设为 `probe/alternate:high`；主进程 PID 不变，下一次子 Agent 的模型请求及执行结果均为 alternate/high。 |
| 主 Agent 显式 effort 的优先级 | 开启 `task.enableEffort` 后，task 指定 `lo` 会覆盖配置的 high；子 Agent 实际使用 alternate/minimal。 |
| 重置配置 | `config reset task.agentModelOverrides --json` 后，同一主会话下一次创建恢复为 probe/low。实验只在临时配置中重置整个映射。 |
| 原生写入校验 | 无效 `defaultThinkingLevel` 被 CLI 拒绝，原值未改变。不能由此推断所有 record 内容都具有同等严格校验。 |

[机器结果](../../.scratch/omp-runtime-feasibility/settings-result.json)保存设置样本、实际模型/档位和进程退出结果；[检查代码](../../.scratch/omp-runtime-feasibility/settings-checks.cjs)复用 [原探针](../../.scratch/omp-runtime-feasibility/probe.cjs)。复现：

```sh
node .scratch/omp-runtime-feasibility/probe.cjs /absolute/path/to/omp /tmp/d-pi-settings-result.json settings
```

二进制、源码版本及 SHA-256 同前轮。只运行 settings 分支，不重跑前轮 9 项实验。模型列表是原生发现结果，不表示列出的每个提供商均有有效认证或已经调用验证。

## GUI 与原生接口的分工

| GUI 所需数据/操作 | 可用原生入口 | 限制 |
| --- | --- | --- |
| 设置当前值、类型、说明 | `omp config list --json` / `get <key> --json` | 某些说明为空；list 对已有凭据可返回 `redacted: true` 并省略 value，不能将其视为未配置。不要为普通设置页逐项 get 凭据。 |
| 保存与恢复设置 | `omp config set <key> <value> --json` / `reset <key> --json` | Host 使用参数数组调用，沿用同配置目录及项目 cwd，保存后回读。不要在 Renderer 拼 shell 或自行覆盖配置 YAML。 |
| 子 Agent 模型与思考默认值 | `task.agentModelOverrides`：Agent 名 → `provider/model:level` | 本轮按定义类型配置，所有后续对应 spawn 受影响。record 是整体值，修改单行需保留其他键并串行处理写入。 |
| 可选模型 | RPC `get_available_models` | 是发现结果，不是登录或网络可用性验证。 |
| 可选思考档位 | RPC `get_available_thinking_levels` | 返回当前主会话模型的档位；不应为了设置页选择子 Agent 模型而切换正在工作的主会话。任意候选模型的档位需要读取匹配版本模型元数据或隔离查询。 |
| 正在执行的 Agent | RPC 子 Agent 事件、`get_subagents` | 活动实例不是全部 Agent 定义目录；不可用它自动生成完整的可配置 Agent 类型列表。原生 `omp agents` CLI 当前提供 unpack，不提供结构化 list。完整定义列表仍需薄适配，或先只展示产品支持的 Agent 类型。 |

原生 JSON 目录提供 `value/type/description`，**没有完整输出 enum choices、默认值、UI 分组、所有数值约束和配置来源**。因此“数据由原生提供、GUI 自己展示”可行；“只靠这一份 JSON 自动生成完整设置页”还不成立。首版只展示有需要的设置，用固定版本的原生 schema 补少量展示元数据即可，不需要立即建设通用配置平台。

## 生效时点与优先级

源码 `resolveEffectiveSubagentPolicy()` 在每次 spawn 前调用 `settings.reloadFromDisk()`，再读取 `task.agentModelOverrides`。这解释了本轮外部 CLI 写入无需重启即可影响下一次创建；**不要将这个结果推广为所有设置都支持立即热更新**。

界面应表达“子 Agent 默认模型与思考档位，后续创建生效”。如果开放 OMP 的 `task.enableEffort`，主 Agent 可以在 task 调用中覆盖思考档位，本轮已实测。该开关默认关闭；若产品要提供“固定配置”和“允许主 Agent 调整”两种策略，应明确展示，而非把默认值包装成不可覆盖的强制档位。本轮没有验证恶意参数或策略强制约束。

## 固定版本源码依据

- [配置 CLI](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/cli/config-cli.ts)：JSON 输出字段、敏感值处理、设置写入与校验。
- [配置 schema](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/settings-schema.ts)：`task.agentModelOverrides`、`task.enableEffort` 与原生 UI/schema 元数据。
- [子 Agent 创建策略](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/task/structured-subagent.ts)：创建前刷新磁盘配置、模型覆盖的解析。
- [Agent 定义与 effort](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md)：定义模型、档位与 task effort 的优先级。
- [RPC 类型](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/modes/rpc/rpc-types.ts)：模型列表和当前模型档位接口的范围。

## 后续边界

当前用户需要的“配置 → 主 Agent 原生创建 → 实际使用所选模型/档位”已闭环，不再把复杂的指定实例控制当作前置阻碍。无需重复该实验，也不自动进入 UI 实现。

真正做 Settings 时再收束：首批可展示字段、Agent 类型目录的薄适配、候选模型档位查询和项目/共享配置作用范围。这些属于界面接入设计，不影响本轮配置通路的可行结论。完整随包交付和 GUI 体验仍不在本轮验证范围。
