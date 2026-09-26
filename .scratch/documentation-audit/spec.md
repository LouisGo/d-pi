---
title: 全部文档与项目 skill 自底向上审计
status: documentation-reviewed-runtime-validation-pending
date: 2026-09-26
---

# 审计结论与范围

> 本记录截至用户后续确认技术选型之前，包含当时的检查结果。2026-09-26 后续 D-32–D-35 已更新 B-01/B-02、P-02/P-05 及相关合同；下文“保持不变”“尚未采用”“未授权提交”均是审计当时状态，不覆盖后续确认与 commit/push 授权。见[决定登记](../../docs/decisions.md)。

现行方向可以延续，不需要重选 Electron/SessionHost/OMP、Monaco 或无头功能架构。主要问题是部分底层限制没有传到接入门槛，以及入口、状态和历史措辞让后续 AI 可能误读。此次据已有决定修订文档，不新增产品实现、不安装依赖、不提交或推送。

审计起点为 HEAD `7529de52189064a12154755a6eb320b2e53226dc`。覆盖原有 **45 份 Markdown：28 份现行文档（含项目 SKILL.md）、17 份归档文档**，另审查项目 skill 的 `agents/openai.yaml`。顺序为原始协议/配置/实验与历史 → 领域与所有权 → 行为/架构合同 → 需求/阶段/候选 → 决定状态 → AI 入口与交接。下方逐文件清单便于复核覆盖范围。

现行文档与独有归档正文均已阅读；重复归档通过全文相等检查或逐项差异对照核对，而非重复加载相同文本。额外核验归档清单 49 份文件的长度与 SHA-256，以及 Runtime / Settings / 随包实验已有 JSON 的 9 / 6 / 4 项通过记录。此次没有重跑实验，没有把历史版本、固定模型或本地包证据升级为当前产品验收。原有未跟踪 `.scratch/omp-gui-m1/` 运行数据保持不动。

本次依据用户要求，把项目 skill 当作被审对象，未用它支配审计。官方标准采用 OpenAI 2026-09-11 发布的 [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)：触发范围准确、入口简短、按需加载细节、避免重复流程与不必要审批。补充参考官方 [Build skills](https://learn.chatgpt.com/docs/build-skills) 的元数据、渐进加载与使用场景原则；检索日期为 2026-09-26。内置 `openai-docs` 用于官方资料定位，`skill-creator` 用于格式核验，`domain-modeling` 用于词汇表边界；项目决定仍以仓库现有记录为准。

## 已处理的问题

以下是有具体触发条件的文档风险，不是声称尚未实现的新产品已经出现这些运行缺陷。

| 编号 / 影响 | 原始依据与触发条件 | 处理 |
| --- | --- | --- |
| A1 / 输入正确性 | 归档 [RPC 分帧说明](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/rpc-v18.3.0.md#transport-and-framing)规定输入为单个未分片 JSONL，v2 分片针对 stdout；原合同 25/100 MiB 是原始内容预算。直接把附件转 base64 后假定可同样分片输入，会高估接入能力 | [基础契约 §4/8/9](../../docs/architecture/foundation-contracts.md)补充编码后字节数、实际输入边界和原生资源通路的 G1 验证。没有把文档的 SHOULD 限制写成已证实硬拒绝，也没有降低输入目标 |
| A2 / 图片完整性 | 归档 [models.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/models.md)的 Image handling 说明 `stripImageInput` 可能在实际编码时移除图片；只检查 `input: [text, image]` 可能误报支持 | 同一合同要求核实实际 provider/transport/compat 与送出的内容；不把静默丢图当成功，沿用显式降级/阻止该表示的行为 |
| A3 / 内容权限 | [旧架构](../../docs/archive/pre-reset/docs/prototype/v1-architecture-draft.md)明确模型输出、HTML、链接和附件均不可信；现行合同突出 IPC/路径，却未完整继承内容呈现边界 | 基础契约 §5 补回不可信内容与特权调用隔离，按相关切片验收；不引入新的工具沙箱或安全平台 |
| A4 / 状态与选型 | [决定登记](../../docs/decisions.md)原把“未验收设计”归为提议，可能弱化已确认但未实测的合同；09-26 技术审议未进登记，且近期行动句容易被单独读成现行选型 | 区分决定状态与验收状态；新登记 P-05 只索引既有提议，审议稿明确未采纳前仍沿用 B-02/P-02/持久化合同。Shiki 标题与 B-03 沿用方向一致 |
| A5 / 阶段范围 | [需求](../product-requirements/spec.md)仍写输入批次待定、下一步重新划分阶段，但 D-26/基础方案已确定 M1 文字/选区、M2 全部指定输入 | 统一指向基础契约 §8，保留最终目标与 M3 能力，不把 M1 可运行视为首版全验收 |
| A6 / 权限概念 | [preflight 关闭表](../product-requirements/preflight-review.md)仍写“三层信任”，但末尾修订已取代为两个独立设置 | 更新当前关闭表及解释，保留旧方案及取代理由，避免把 App 文件访问范围当作 Agent 沙箱档位 |
| A7 / 提交语义 | [CONTEXT](../../CONTEXT.md)原“已提交的追加需求不再属于草稿”未区分点击发送、原生接受与未知结果 | 排队追加定义补充接受条件和 unknown 内容保留；Thread 定义移除不必要的技术字段，细节仍归基础契约 |
| A8 / AI 执行效率 | 入口重复阅读列表，项目 skill 重复合同细节，架构评审与普通文档审计边界不清；“本轮/阶段授权”跨任务后可能被误读成永久禁止开发或逐步申请 | 新增 [文档导航](../../docs/README.md)，精简 AGENTS 与 skill 的路由，声明日常只读相关材料、已有完整实现授权不逐层重复确认；所有实质决定边界保留。skill 修订稿通过格式核验后，经受保护路径写入授权保存 |
| A9 / 工作流可执行性 | [领域约定](../../docs/agents/domain.md)要求缺失材料静默继续并引用当前不可用的 skill 链；[issue 约定](../../docs/agents/issue-tracker.md)的 Frontier 使用 open，却未明确该状态 | 移除不可用 skill 的必经关系；实质证据缺口需明确；任务状态统一 open/claimed/resolved，Wayfinder/to-tickets 仅按需使用，不成为安装或额外拆票的前置 |

涉及 D-11、D-24–D-26 的表述澄清与 G1 门槛细化，沿用 D-28–D-30 的功能交付；**D-01–D-31、B-01–B-04 与 P-02 的既定状态均不改变**。P-05 不等于接受 Base UI、Tiptap、SQLite 或 Effect。所有不可变归档保持原貌。

## 仍需实际验证的内容

这些是现有合同的实施门槛，不是重新要求用户回答七项方案问题，也不需要在首个功能前完成全部门槛。

| 对应切片 | 仍缺的证据 | 对推进的影响 |
| --- | --- | --- |
| M1 提交与恢复 | 各命令业务接受证据、success 后迟到失败、持久收据故障与 unknown；原生会话占用/单写、崩溃恢复 | 按基础契约 §1/2 的 G1 处理；没有证据不能清空输入、自动重发或宣称恢复安全 |
| M1 阅读、停止与生命周期 | streaming/compacting 时历史来源与补页；工具/队列/steer/交互组合下的停止结果；关窗后台及重开 | 原型已有部分证据可复用，当前多 Thread 合同和实际集成仍须验证；abort 回执不是全部工作停止 |
| M1 输入与呈现 | Composer IME/焦点、Monaco worker、内容呈现边界、只读项目服务不执行项目代码 | 最小相关实验可先做；Composer 仍按 P-02 验证，没有假定某库已胜出 |
| M2 新认证与全部附件 | OpenAI 账户/DeepSeek key 的原生桥接、Finder 环境；PDF 转换、编码后 RPC 输入和有效图片模态 | 只阻塞对应切片及 M2 完整验收，不阻塞 M1 已有配置闭环；缺口不能静默删需求 |
| M1/M2 输出、诊断、质量 | 原生/补充历史覆盖、有界快照与事件恢复、实际输入/日志/内存负载、真实 Electron 用户路径与 macOS 本地包 | 初始性能数字仍为目标；无头通过、旧机器结果和旧 GUI 不替代本次集成验收 |
| M3 | Run/Review/Revert 语义、Side Chat、编辑/语言服务、浏览器、终端、PNG、Git 写操作等 | 在相应阶段细化，不作为首个闭环的全集前置 |

新版本依赖与平台兼容性需在接入时核实。本次没有重新验证技术审议稿所有外部库的最新 API/版本；审核的是这些建议在现行决定中的状态、范围及论证边界。

## Skill 场景检查

项目 skill 保持名称与现有 UI 元数据，不把“本次审计不用它”扩大为全局禁用隐式触发。入口引用现有合同，不另造 references 文档复制同一规格。

| 请求示例 | 静态审查的预期路由 |
| --- | --- |
| “实现提交无头模块” | 使用 skill；按提交场景读基础契约 §2 与无头合同，做对应 G1 和必要故障验证 |
| “把 M1 拆成可交付任务” | 使用 skill 与本地任务约定；按行为拆分，不强制所有票包含 GUI |
| “评审 Thread 切换是否会停止后台任务” | 使用 skill，检查拥有者/生命周期与实际证据，不重开全栈选型 |
| “把按钮图标尺寸改一下” | 不触发功能 skill；仍遵守图标合同与该改动必要验证 |
| “修 README 错字” | 不触发功能 skill，不加载全部架构/实验，不生成实现票 |
| “审查全部文档和这个 skill” | 不以被审 skill 作为审查标准，按当前用户指定的方法审查 |
| “在已有完整实现授权下完成该功能” | 必要验证、无头与 GUI 连续推进，真实阻塞才暂停；不重复申请同一范围授权 |

上述是人工静态场景走查，**不是实际模型触发评测**，不据此承诺所有后续 AI 都会正确选择或执行 skill。

## 校验结果与限制

- 归档清单 49/49 份长度与 SHA-256 一致；归档 README、manifest 及其他历史材料也未修改。
- 既有 Runtime / Settings / 随包 JSON 分别记录 9/6/4 项通过；只核验已有记录，不是本次新测试。
- 最终 47 份 Markdown 的本地目标和锚点完成扫描，现行文档无断链或失效锚点；`git diff --check` 通过。不可变归档有 31 处指向未归档上游文件/旧目录的相对链接，按历史来源规则保留；现行导航不依赖这些失效位置。
- D-01–D-31、B-01–B-04 与 P-02 的登记行与审计起点逐字一致；归档工作区 diff 为空。skill 写回内容与已校验修订稿一致，变更只包含文档和该 skill。
- 修订 skill 使用现有 Ruby Psych 成功解析 YAML，已检查 name/description、允许字段、长度、未完成占位、7 条相对引用、UI 字段与 `$d-pi-headless-features` 默认提示。`agents/openai.yaml` 无需修改。
- 内置 `quick_validate.py` 已尝试，但系统与附带 Python 均缺 PyYAML，未运行成功；没有为此安装依赖，不能宣称该官方脚本通过。上述替代检查通过不代替模型行为评测。
- 没有当前产品代码变更，未运行产品测试、GUI 或 Runtime 实验。检查脚本只放在临时目录，未增设长期测试框架。

## 逐文件覆盖清单

以下覆盖审计开始时全部 45 份 Markdown，外加 skill UI 配置。新增的本记录和 `docs/README.md` 在完成后同样纳入链接与一致性检查。历史材料中的当时授权、任务状态和旧默认值只作为历史读取，不作为本轮指令。

### 现行文档：28 份

| 文件 | 审查重点 |
| --- | --- |
| [.agents/skills/d-pi-headless-features/SKILL.md](../../.agents/skills/d-pi-headless-features/SKILL.md) | 作为被审对象检查触发、职责与加载方式 |
| [.scratch/omp-runtime-feasibility/spec.md](../../.scratch/omp-runtime-feasibility/spec.md) | 独立探针范围与结果入口 |
| [.scratch/product-requirements/composer-research.md](../../.scratch/product-requirements/composer-research.md) | P-02 理由、原型场景与未定项 |
| [.scratch/product-requirements/foundation-plan.md](../../.scratch/product-requirements/foundation-plan.md) | 首版 V1-00–10、输入与变更来源 |
| [.scratch/product-requirements/preflight-review.md](../../.scratch/product-requirements/preflight-review.md) | 历史问题、关闭状态与取代关系 |
| [.scratch/product-requirements/spec.md](../../.scratch/product-requirements/spec.md) | 最终目标、阶段与用户确认记录 |
| [.scratch/product-requirements/technical-evaluation.md](../../.scratch/product-requirements/technical-evaluation.md) | 六组选型的既有依据及候选边界 |
| [.scratch/workspace-reset/spec.md](../../.scratch/workspace-reset/spec.md) | 清理/恢复范围与保全关系 |
| [AGENTS.md](../../AGENTS.md) | 授权延续、决定连续性、上下文路由 |
| [CONTEXT.md](../../CONTEXT.md) | 领域词汇、提交与排队语义 |
| [README.md](../../README.md) | 当前状态和导航入口 |
| [docs/adr/0001-omp-session-client.md](../../docs/adr/0001-omp-session-client.md) | 执行与会话所有权 |
| [docs/adr/0002-share-native-omp-config.md](../../docs/adr/0002-share-native-omp-config.md) | 随包 Runtime、原生配置与认证 |
| [docs/agents/domain.md](../../docs/agents/domain.md) | 术语/ADR 使用与缺失依据处理 |
| [docs/agents/issue-tracker.md](../../docs/agents/issue-tracker.md) | 本地任务格式、状态与可选工具 |
| [docs/architecture/diagnostics.md](../../docs/architecture/diagnostics.md) | 关联上下文、错误归属、有界日志与性能 |
| [docs/architecture/foundation-contracts.md](../../docs/architecture/foundation-contracts.md) | 身份、提交、配置、输入、权限、恢复与验收 |
| [docs/architecture/headless-features.md](../../docs/architecture/headless-features.md) | 按功能交付、拥有者和独立生命周期 |
| [docs/architecture/icon-system.md](../../docs/architecture/icon-system.md) | D-31、视图层类型、无障碍和裁剪验收 |
| [docs/architecture/technology-selection-review.md](../../docs/architecture/technology-selection-review.md) | 新建议与现行基线的关系，补登记 P-05 |
| [docs/archive/stage1-evidence.md](../../docs/archive/stage1-evidence.md) | 历史真实 GUI 与受控协议证据的区别 |
| [docs/decisions.md](../../docs/decisions.md) | D/B/P 状态、来源和取代关系 |
| [docs/prototype/frontend-library-radar.md](../../docs/prototype/frontend-library-radar.md) | 沿用、候选、未采用与集成条件 |
| [docs/prototype/handoff.md](../../docs/prototype/handoff.md) | 历史工作、复用范围与当前下一步 |
| [docs/prototype/v1-architecture-draft.md](../../docs/prototype/v1-architecture-draft.md) | 有效架构、状态归属与历史取代 |
| [docs/validation/packaged-runtime-evidence.md](../../docs/validation/packaged-runtime-evidence.md) | macOS 本地包通路与发行限制 |
| [docs/validation/runtime-feasibility.md](../../docs/validation/runtime-feasibility.md) | 9 项固定版本能力与范围 |
| [docs/validation/settings-feasibility.md](../../docs/validation/settings-feasibility.md) | 6 项原生设置及后续 GUI 边界 |

另审查 [.agents/skills/d-pi-headless-features/agents/openai.yaml](../../.agents/skills/d-pi-headless-features/agents/openai.yaml) 的展示元数据与默认提示，格式有效，无需变更。

### 历史文档：17 份

| 文件 | 阅读与核对方式 |
| --- | --- |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/decisions.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/decisions.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/prototype/README.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/prototype/README.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/research/README.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/README.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/research/extensions.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/extensions.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/research/findings.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/findings.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/research/models.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/models.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/research/rpc-v18.3.0.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/rpc-v18.3.0.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/research/rpc.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/rpc.md) | 与 rpc-v18.3.0.md 字节相同，全文阅读后复用 |
| [docs/archive/pre-reset/.scratch/omp-gui-m1/spec.md](../../docs/archive/pre-reset/.scratch/omp-gui-m1/spec.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/README.md](../../docs/archive/pre-reset/README.md) | 全文阅读，作为固定历史依据保留 |
| [docs/archive/pre-reset/docs/prototype/frontend-library-radar.md](../../docs/archive/pre-reset/docs/prototype/frontend-library-radar.md) | 与现行对应文档逐项对照，阅读全部差异 |
| [docs/archive/pre-reset/docs/prototype/handoff.md](../../docs/archive/pre-reset/docs/prototype/handoff.md) | 与现行对应文档逐项对照，阅读全部差异 |
| [docs/archive/pre-reset/docs/prototype/packaged-runtime-evidence.md](../../docs/archive/pre-reset/docs/prototype/packaged-runtime-evidence.md) | 与现行对应文档逐项对照，核验机器结果 |
| [docs/archive/pre-reset/docs/prototype/runtime-feasibility.md](../../docs/archive/pre-reset/docs/prototype/runtime-feasibility.md) | 与现行对应文档逐项对照，核验机器结果 |
| [docs/archive/pre-reset/docs/prototype/settings-feasibility.md](../../docs/archive/pre-reset/docs/prototype/settings-feasibility.md) | 审计初始版本与现行文档全文相同，复用全文阅读 |
| [docs/archive/pre-reset/docs/prototype/stage1-evidence.md](../../docs/archive/pre-reset/docs/prototype/stage1-evidence.md) | 与现行历史证据汇总对照，核对新增历史声明 |
| [docs/archive/pre-reset/docs/prototype/v1-architecture-draft.md](../../docs/archive/pre-reset/docs/prototype/v1-architecture-draft.md) | 全文阅读，作为固定历史依据保留 |

## 2026-09-26 后续确认落实与检查

用户随后确认 D-32–D-35，并明确要求检查后 commit/push。此前审计保留为历史；现行 Base UI、最小 Tiptap、SQLite、ts-pattern/Zod v4 及 TypeScript 标准已同步到决定、需求、基础契约、选型/研究、交接与 AI 入口。新增 `docs/architecture/typescript.md` 和 `d-pi-typescript` skill，原无头 skill 按需引用，不复制标准正文。

检查：49 份 Markdown 的现行本地链接/锚点无错误，`git diff --check` 通过；D-01–D-31 与无关基线/提议未变，D-32–D-35 唯一，B-01/B-02/P-02/P-05 的调整有明确取代关系；49 份归档长度与哈希仍一致。两项 skill 的 YAML、元数据与相对引用检查通过，写回内容与校验稿一致。新 TypeScript 文档示例由已安装 TypeScript 5.9.3 完成语法检查；未安装产品依赖，未运行完整类型/集成检查。官方 skill 校验脚本仍受缺 PyYAML 限制，使用现有 Ruby Psych 及字段检查替代，未宣称模型行为评测通过。

本次提交范围包括本轮选型确认及上一轮尚未提交的文档审计成果；原有未跟踪运行数据不纳入。实际 commit/push 结果以 Git 与远端核验为准，不在文档中预写成功。
