# 本地 Markdown 任务约定

需求与任务记录放在 `.scratch/<feature-slug>/`，不是外部服务。提到“发布到 issue tracker”时，在该目录创建或更新相应文件；“获取任务”就是读取给定路径或编号，不要求联网或安装工具。

## 日常开发与隔离

2026-10-09 用户确认精简单人维护流程，取代按新增功能默认建立 worktree、集成分支和本地 PR 的执行方式。默认在当前目录的 main 串行完成实现、相关验证、diff 审查、范围清楚的 commit 和 Dev 交付；已有合适分支可继续使用，不为遵循默认而切换或搬动未提交工作。commit、push、发布的授权和实际结果分别判断。

| 当前需要 | 工作方式 |
| --- | --- |
| 普通功能、修复、UI 迭代，只有一个写入任务 | 当前目录开发，不新增分支、worktree 或 PR |
| 实验、大重构，或需要保持 main 可用 | 按需在当前目录使用短期分支；合回不默认生成 PR 文档 |
| 多个 Agent/chat 同时写代码，或需保留正在运行的基线 | 使用独立 worktree 隔离；只读调查/评审可读取固定差异，无须新检出 |
| 用户要求 PR，或实际采用外部审查/远端合并门禁 | 才进入 PR 流程 |

任务规模、代码跨模块或票数本身不触发隔离；按并发写入、冲突和基线保留需要决定。并行写者必须各有工作目录，禁止 reset/stash 用户改动来制造干净状态。验证选择见[无头功能合同](../architecture/headless-features.md#日常改动的验证选择2026-10-07)。

## 文件与状态

- 需求与设计：`spec.md`。普通任务复用已有 spec 或票，不默认新建规格、任务票、validation/review/handoff/pr 文档。需要独立接手且没有所属记录时，在 `spec.md` 写最小记录；一次性文字修正可由 diff 和交付说明表达。
- 需要拆分实现任务时：`issues/<NN>-<slug>.md`，从 `01` 编号，一票一文件，不合并为一个总票文件。已发布票需要再拆时用 `NN<字母>`（如 `05a`/`05b`/`05c`）作为正式 ID，并在父票与 spec 中按该 ID 互引。
- 任务使用 `Status: open` / `claimed` / `resolved`；需要接手时先标记 `claimed`，完成后记录实际结果与验证，再标记 `resolved`。需求文档的设计状态不能冒称实现完成。
- 真正阻塞依赖写为 `Blocked by: NN, NN`；无阻塞写 `Blocked by: none`，省略该字段等同无阻塞。列出的任务均为 `resolved` 后才解除阻塞。不把所有候选调查串成全局前置。
- 讨论与补充按时间追加在 `## Comments` 下，保留决定变更的理由。

## 功能拆分（D-28–D-30）

按[无头功能合同](../architecture/headless-features.md)拆最近要交付的功能：默认在功能票内引用官方文档、固定版本源码或既有证据后直接实现；只有资料不足且会影响关键选择的未知才单独拆验证票，并写明问题、最小样本、停止条件和真正依赖。无头功能票提供可执行逻辑及必要测试，GUI 票消费有依据的合同并验收交互，不为凑齐三阶段机械拆票。小功能可在一票内依次完成；大功能按独立可验收行为拆分，不按全产品 store/hooks/pages 横向排工，也不要求每张无头票画界面。

任务记录所处阶段（G1/M1/M2/M3）、受影响决定、行为目标、真正阻塞依赖、关键状态/资源拥有者及释放条件、验收证据。多个可分别交付的目标通常应拆开；只创建一个字段或按钮、无法独立验证价值的任务通常应合并。已有任务说明足够时，不另造重复规格。

先细化最近的 G1/M1，后续能力保持较粗。生成任务不授权开始实现；一次已授权的完整功能实现包含其必要验证、修复和 GUI 接入，无需每一层再次确认；无头验收不代替 M1/M2 的 GUI 验收。

## Spec 对齐与跨会话交接

落实根 AGENTS.md 的用户参与规则。先复用当前请求和已有规格，仅实际依赖、独立交付或重要待决需要时补规格、拆票。先向用户简述本段结果、范围、必要验证及待决问题，无重要未决项且实施已授权时可继续，不等整份文档批准。

普通任务只在所属 spec 或票的一处简记目标、完成内容、验证结果和剩余问题；授权变化、重要决定与试用状态写在同一处，需要其他入口时只加链接。长切片的现态由 spec 的“推进与交接”及 `project-status` 维护，票保留自身工程状态，不重复抄写整段交付信息。

独立 validation/review/handoff 仅用于内容复杂、固定候选或明确交接需求；原始证据保留有价值的失败、关键结果和必要截图，简记来源及适用范围，不收录每次操作流水或反复复制同一身份/验证结论。长期合同只在公开行为、所有权或既定决定变化时更新；历史记录保持原样。

常规技术细节自主决定，记录实际需要接手的信息。实质影响产品行为、权限/成本、范围或既有方向的选择才需要用户判断，保留答复依据及依赖它的工作；不制造待决或用缺少文档字段阻塞独立工作。

Ticket 的 resolved 表示该票声明的交付与验证完成，不自动代表用户认可整段体验。如果该票明确包含用户体验验收，未收到所需反馈不能标 resolved；否则工程票可以完成，spec 保留“已交付待试用”。影响后续方向的反馈先处理，无关工作在授权内继续。

接手时先看所属简记或 spec 的“推进与交接”，再补相关票和决定；缺失关键答复依据时保留未知。交付或收到影响后续工作的答复时更新这一处记录；注册到看板的状态变化同步结构字段并生成看板，不要求每次编辑更新进度。本地文件已写入不等于已提交或已推送。

## 授权切片与 Ready Frontier

Spec 可以长期演化，执行单位是本轮已授权、可验收的工作。普通串行任务不要求先建 DAG；使用已拆分票时选择最近要交付的 leaf，包含多个行为或已有子票的父票先细化再派发。生成票或计划均不增加授权；重要产品待决只暂缓依赖它的工作。

多票调度时，在所属 spec 维护一个 `implementation-plan` JSON 数组块，记录切片 ID、选中的票与可选的暂缓原因；它不复制状态或依赖。旧规格和单票小修不强制补计划。例：

```implementation-plan
[
  {
    "id": "next-slice",
    "tickets": ["04a", "05b", "06"],
    "hold": {"06": "等待该票所需的产品答复；依据见推进与交接"}
  }
]
```

字段及校验单源见 [slice-plan.mjs](../../scripts/tasks/slice-plan.mjs)：`id` 为 spec 内唯一 slug，`tickets` 为非空且不重复的同范围票 ID，`hold` 可选，键必须在选票中且理由非空。只读运行：

```sh
pnpm plan:slice -- .scratch/<feature>/spec.md --slice <slice-id>
```

**Ready Frontier 是集合**：计划选中、`Status: open`、所有 `Blocked by` 已 resolved、无 hold 的票。命令还输出 claimed、blocked、held、resolved，依赖即使不在选票中也不能忽略。计划之外的 open 票不会自动加入；命令不领取票、不创建 worktree、不推断授权或 leaf 粒度。文档与看板门禁拒绝非法计划和依赖，计划块变化同时触发看板来源指纹更新。

主 Agent 在 dispatch 前核实当前用户授权、验收条件和写集/共享接口；ready 只是结构候选。共享文件、配置、资源或尚未稳定的合同可能要求串行，必要时先交付公共接口票再 fan-out。编号只用于稳定展示，不决定独占执行顺序，也不为追求并发拆无价值的碎票。

## 执行归属与集成

按 [d-pi-implement-slice](../../.agents/skills/d-pi-implement-slice/SKILL.md)执行，既有工程 skills 继续负责具体实现。串行任务按日常默认完成；选择并行隔离实现时才使用下面的归属和集成流程，固定基点与集成位置，必要时建立 `codex/<slice>` 分支。

| 拥有者 | 写入范围 |
| --- | --- |
| 主 Agent / orchestrator | 领取与释放、票 Status、spec 授权/计划/交接、生成看板、集成分支、整体验证与最终交付 |
| implementer | 分配的代码、测试及相关文档写集；独立 worktree/分支中的提交、行为证据和未解决项；不写共享任务状态或合入集成分支 |
| reviewer | 固定范围只读审查与发现；可使用固定 ref 或差异快照，不自行修改被审源码或扩大修复范围 |

主 Agent 先将待派发票标 claimed，记录 ticket→Agent→worktree→branch→起点 SHA 的必要映射在 spec 的推进记录中。给 worker 的指针包括当前 spec 对应节、票、合同/模块入口和可写范围，不复制整份开发历史。并行写者必须各有工作目录；工具无法隔离时串行执行，不把共享 cwd 当作自动隔离。

Worker 完成只表示实现待集成：提供 commit SHA、测试与原始结果、未覆盖项、范围外修改及遗留风险。主 Agent 串行集成，检查语义冲突与真实源状态，完成该票声明的验收后才 resolved；新依赖可由最新集成点启动。合并失败不算完成，普通冲突由主 Agent处理，重大语义歧义回到合同。不得 reset/stash 用户改动或删除未保存工作来制造干净状态。

重接 claimed 票时先核实原 Agent/分支与已保存工作，继续或释放后再派发，不能重复执行。某票受阻时保留原因，继续其他 ready；没有 ready 时区分运行中、真实 blocker、hold 和图已完成，不空转。Review 发现改变已完成证据的问题时，重新打开受影响票并同步其依赖票状态，保持“resolved 的依赖均完成”约束。

集成后的整段差异核对组合合同，按风险选择评审方式和验证入口；局部票评审不替代组合合同。检查失败先分类，环境无法运行时保留未验证项，不更改目标迁就结果。使用过 worktree 的任务在收尾核实是否仍有用途，确认提交/合入及需保留证据后再清理；App 管理的 worktree 用 archive，普通 Git worktree 按已保存状态移除，失败或未合入的工作保留可恢复位置。

## Review、PR 与 Retro 收尾

- 普通任务由主 Agent 一次 diff 审查覆盖当前要求与相关合同，不默认生成 review 文档或派两个 reviewer。执行/恢复/权限/事务/跨进程身份等高风险变化、复杂组合或用户明确要求时，选择独立评审；具体固定差异和模式由 [review skill](../../.agents/skills/d-pi-code-review/SKILL.md)维护。
- PR 仅在用户要求或实际采用外部审查/远端合并门禁时启用；普通任务交付 commit/diff 与简短记录，不生成 `pr.md` 或模拟本地 PR 仪式。本地票不依赖 PR 关闭。push/创建远端 PR 仍需相应授权，实际创建后在 Codex 中 attach；已选择 PR 的 body/CI/合入规则见 [PR skill](../../.agents/skills/d-pi-pr/SKILL.md)。
- PR 合并本身不证明工程验证、真实 GUI、用户试用或认可。满足票的工程验收才 resolved，spec 的 engineering/trial/acceptance 仍分别更新；待验收父票继续开放。日常试用默认 Dev，固定包的用途与交接要求见[本地交付](../engineering/local-delivery.md#选择运行与交付方式)，不将历史候选步骤套用到每次收尾。
- 收尾、反复失败或重要 review 发现时，可记录可复用的 retro 候选及证据。请求复盘时按 [d-pi-retro](../../.agents/skills/d-pi-retro/SKILL.md)分析；默认建议，由用户选择或在现有明确升级授权内实施，不自动执行整套复盘或写新规则。无可复用问题时可以无改动结束。

## 可选的 Wayfinder / to-tickets

仅在用户要求或当前任务已采用对应流程时使用；skill 不可用时按上述约定手工完成，不安装为本仓库的前置依赖。

Wayfinder 可用 `.scratch/<effort>/map.md` 汇总 Notes / Decisions-so-far / Fog；每个问题仍放在 `issues/NN-<slug>.md`。`Type:` 可为 `research` / `prototype` / `grilling` / `task`，状态沿用上表。Frontier 沿用上面的集合定义；单问题探索可取其中一票，写集独立时再并行。解决后在票中追加 `## Answer` 并标 `resolved`，再把摘要和链接写入 map 的 Decisions-so-far。只有实际需要这种导航时才维护 map。

## 总看板读取约定

固定入口是 [docs/status.md](../status.md)。只对需要汇总的阶段/切片，在所属 `spec.md` 增加一个 `project-status` JSON 数组围栏块；不要求全部 Markdown 改成 frontmatter。字段枚举与读取单源在 [聚合脚本](../../scripts/tasks/project-status.mjs)，正文继续维护范围、理由和实际证据。历史记录有日期，结构字段表达现态，旧 frontmatter `status` 不再承担另一套进度。

每条记录有稳定 `id`（在 `phase` 内唯一）、`title`、`phase`（G1/M1/M2/M3/基建）、`engineering`（planned/in-progress/partial/complete）、`trial`（not-delivered/delivered/feedback/not-applicable）、`acceptance`（pending/accepted/not-applicable）和 `next`。可选 `build` 表示实际可识别构建，`evidence` 与 `pending` 为相对 spec 的文件路径，`constraints` 记录继续边界；只有当前任务的记录使用 `current: true`。accepted 必须有试用与用户反馈证据，Agent 不推断认可。

任务仍只使用 `Status: open/claimed/resolved`；`Blocked by` 只列同一切片 NN/NNletter 的真实工程依赖（逗号分隔），无则 none 或省略。产品待决通过 spec 的 `pending` 指向所属票，不给无关票强加 blocker。门禁拒绝非法/重复状态、失效依赖、循环及依赖未完成却 resolved。票包含用户体验验收时继续 claimed；纯工程票可以 resolved，试用状态独立。

更新规格或票后运行 `pnpm report:status:write`，审查后与源一起提交；`pnpm check:status` 比较生成输出及来源指纹，拒绝陈旧聚合。文档门禁检查现行链接、锚点及 D-ID；生成器不抓外部网址或猜测产品状态。新切片按此短约定自然进入同一看板，不建立第二份手工状态表。
