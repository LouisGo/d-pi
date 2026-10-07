# 本地 Markdown 任务约定

需求与任务记录放在 `.scratch/<feature-slug>/`，不是外部服务。提到“发布到 issue tracker”时，在该目录创建或更新相应文件；“获取任务”就是读取给定路径或编号，不要求联网或安装工具。

## 文件与状态

- 需求与设计：`spec.md`。只需要一份审查或调查成果时可直接记录其中，不强制生成任务票。
- 需要拆分实现任务时：`issues/<NN>-<slug>.md`，从 `01` 编号，一票一文件，不合并为一个总票文件。已发布票需要再拆时用 `NN<字母>`（如 `05a`/`05b`/`05c`）作为正式 ID，并在父票与 spec 中按该 ID 互引。
- 任务使用 `Status: open` / `claimed` / `resolved`；需要接手时先标记 `claimed`，完成后记录实际结果与验证，再标记 `resolved`。需求文档的设计状态不能冒称实现完成。
- 真正阻塞依赖写为 `Blocked by: NN, NN`；无阻塞写 `Blocked by: none`，省略该字段等同无阻塞。列出的任务均为 `resolved` 后才解除阻塞。不把所有候选调查串成全局前置。
- 讨论与补充按时间追加在 `## Comments` 下，保留决定变更的理由。

## 功能拆分（D-28–D-30）

按[无头功能合同](../architecture/headless-features.md)拆最近要交付的功能：默认在功能票内引用官方文档、固定版本源码或既有证据后直接实现；只有资料不足且会影响关键选择的未知才单独拆验证票，并写明问题、最小样本、停止条件和真正依赖。无头功能票提供可执行逻辑及必要测试，GUI 票消费有依据的合同并验收交互，不为凑齐三阶段机械拆票。小功能可在一票内依次完成；大功能按独立可验收行为拆分，不按全产品 store/hooks/pages 横向排工，也不要求每张无头票画界面。

任务记录所处阶段（G1/M1/M2/M3）、受影响决定、行为目标、真正阻塞依赖、关键状态/资源拥有者及释放条件、验收证据。多个可分别交付的目标通常应拆开；只创建一个字段或按钮、无法独立验证价值的任务通常应合并。已有任务说明足够时，不另造重复规格。

先细化最近的 G1/M1，后续能力保持较粗。生成任务不授权开始实现；一次已授权的完整功能实现包含其必要验证、修复和 GUI 接入，无需每一层再次确认；无头验收不代替 M1/M2 的 GUI 验收。

## Spec 对齐与跨会话交接

落实根 AGENTS.md 的用户参与规则。补规格与拆票是每个近期切片的准备工作，不另设全产品规格/票表完成门槛；规格已足够时直接复用。先向用户简述本段交付结果、排除范围、验收方式及待决问题，无重要未决项且实施已授权时可继续，不等整份文档批准。

在当前 spec 中维护一个简短的“推进与交接”区，任务票只引用相关项，避免多份状态互相冲突。按实际情况记录：

| 内容 | 必须说明 |
| --- | --- |
| 当前范围与授权 | 正在推进哪个切片、用户授权的工作范围及依据；计划或建议不作为实现授权 |
| 产品判断 | 已定事项引用决定/用户答复；重要待决项保留问题、推荐、影响及依赖它的任务。新问题不能因旧文档未提及而自行定案 |
| 工程状态 | 已完成行为、验证证据、技术未知与下一步；区分模拟、真实接入和真实 GUI 验证 |
| 用户试用 | 尚不可试用 / 已交付待试用 / 已收到反馈及待处理项 / 用户明确认可；记录版本或可识别构建、操作步骤及实际反馈，不把未回复写成认可 |
| 继续边界 | 哪些工作可在当前授权内独立继续，哪些依赖产品答复或体验反馈 |

无重要产品问题时明确写“无”，不用制造问题。常规技术细节由 Agent 自行决定并按需要记录；只有实质影响产品行为、权限/成本、范围或既有方向的选择才需要用户判断。任务依赖重要待决项时，不将其推进到依赖该选择的实现；可先完成不依赖答案的调查或独立工作。

Ticket 的 resolved 表示该票声明的交付与验证完成，不自动代表用户认可整段体验。如果该票明确包含用户体验验收，未收到所需反馈不能标 resolved；否则工程票可以完成，spec 保留“已交付待试用”。影响后续方向的反馈先处理，无关工作在授权内继续。

接手时先看当前 spec 的“推进与交接”，再看相关票和决定；缺失关键答复依据时保留未知，不用接手者的推测补成共识。切片交付、收到答复或结束一轮工作时更新实际状态，不只在聊天中报告。规则和状态保存在仓库，跨机器仍需同步包含这些修改的版本；本地文件已写入不等于已提交或已推送。

## 授权切片与 Ready Frontier

Spec 可以长期演化，执行单位是本轮已授权、可验收的切片。先读“推进与交接”，选择最近要交付的 leaf 票；包含多个行为或已有子票的父票先细化，不直接交给一个 implementer。生成票或计划均不增加授权；重要产品待决只暂缓依赖它的工作。

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

按 [d-pi-implement-slice](../../.agents/skills/d-pi-implement-slice/SKILL.md)执行，既有工程 skills 继续负责具体实现。小而独立的修复可单 Agent 完成；多票/跨边界切片使用固定基点和一个 `codex/<slice>` 集成分支。接手已有合适分支，不机械新建。

| 拥有者 | 写入范围 |
| --- | --- |
| 主 Agent / orchestrator | 领取与释放、票 Status、spec 授权/计划/交接、生成看板、集成分支、整体验证与最终交付 |
| implementer | 分配的代码、测试及相关文档写集；独立 worktree/分支中的提交、行为证据和未解决项；不写共享任务状态或合入集成分支 |
| reviewer | 固定范围只读审查与发现；不与 implementer 共用修改工作树，不自行扩范围修复 |

主 Agent 先将待派发票标 claimed，记录 ticket→Agent→worktree→branch→起点 SHA 的必要映射在 spec 的推进记录中。给 worker 的指针包括当前 spec 对应节、票、合同/模块入口和可写范围，不复制整份开发历史。并行写者必须各有工作目录；工具无法隔离时串行执行，不把共享 cwd 当作自动隔离。

Worker 完成只表示实现待集成：提供 commit SHA、测试与原始结果、未覆盖项、范围外修改及遗留风险。主 Agent 串行集成，检查语义冲突与真实源状态，完成该票声明的验收后才 resolved；新依赖可由最新集成点启动。合并失败不算完成，普通冲突由主 Agent处理，重大语义歧义回到合同。不得 reset/stash 用户改动或删除未保存工作来制造干净状态。

重接 claimed 票时先核实原 Agent/分支与已保存工作，继续或释放后再派发，不能重复执行。某票受阻时保留原因，继续其他 ready；没有 ready 时区分运行中、真实 blocker、hold 和图已完成，不空转。Review 发现改变已完成证据的问题时，重新打开受影响票并同步其依赖票状态，保持“resolved 的依赖均完成”约束。

集成后的整段差异按 [d-pi-code-review](../../.agents/skills/d-pi-code-review/SKILL.md)审查；局部票评审不替代组合合同。验证按风险选择现有入口，检查失败先分类，环境无法运行时保留未验证项，不更改目标迁就结果。清理 worktree 前确认提交/合入和需保留的证据；App 管理的 worktree 用 archive，普通 Git worktree 按已保存状态移除，失败或未合入的工作保留可恢复位置。

## Review、PR 与 Retro 收尾

- Review 保留 Spec 与 Standards 两轴的范围、结论和限制，优先高价值、可触发、有依据的问题；具体固定差异与独立 reviewer 方法由 [review skill](../../.agents/skills/d-pi-code-review/SKILL.md)维护。
- PR 是切片的工程审查载体，可选；本仓库的本地票不依赖 PR 关闭。明确要求或已有授权时才 push/创建远端 PR，可在已有领先提交后开 Draft；否则交付本地分支与可审查 PR 草稿。通过 GitHub/CLI 创建后在 Codex 中 attach。具体 body/CI/ready 规则由 [PR skill](../../.agents/skills/d-pi-pr/SKILL.md)维护。
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
