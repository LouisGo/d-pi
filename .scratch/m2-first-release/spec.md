# M2 首版实施

```project-status
[
  {
    "id": "first-release",
    "title": "M2 首版",
    "phase": "M2",
    "engineering": "in-progress",
    "trial": "delivered",
    "acceptance": "pending",
    "current": true,
    "build": "0.1.0-m2.13 / 7f5d5909-ac115847",
    "pending": [
      "../m1-s3-control-recovery/issues/09-quit-discard-decision.md"
    ],
    "evidence": [
      "../../docs/product/first-release.md",
      "handoff-entry.md",
      "../runtime-hardening-omp1845/handoff.md",
      "configuration-sharing.md",
      "mainflow-feedback.md",
      "progress-audit.md",
      "navigation-continuity.md",
      "development-tools.md",
      "rendering-isolation.md",
      "e2e-convergence.md",
      "warm-session-liveness.md",
      "../review-seven-commits/spec.md",
      "next-stage.md",
      "queue-configuration-review.md",
      "content-preparation.md"
    ],
    "next": "04a附件引用与05c带图队列工程完成，m2.13候选已交付待试用；后续04的PDF视觉/OCR与B4回收、05完整子Agent生命周期等仍开放，M2用户认可pending，冷旧Thread只读",
    "constraints": "2026-10-02用户授权下一阶段M2并行开发与中断后继续；本地commit/候选沿用M2授权，不将旧特定修复push扩大到本轮。保留原有环境对齐未提交改动；不公开发布、不扩M3，冷恢复只读，unknown不自动重发。"
  }
]
```

2026-10-02：用户授权基于 fe03c4f 真实 GUI 报告策略性收敛，高价值修复分阶段提交，丢弃当前工作区改动，检查完成后 push；用户自行手动复试。过滤判断与工程进度见 [E2E 收敛](e2e-convergence.md)及 07–09 票。报告未调用真实模型，不作为 Agent 全流程通过；D-24 冷恢复边界保留。

2026-10-02：用户提供 `dpi-gui-retest-7ae6962.zip`，报告未退出应用时的两次双 scope 中断，并授权优雅修复后 commit。当前工作区从干净 `5d8a323` 开始，本轮本地提交；具体边界、证据、修复和复试见 [暖会话记录](warm-session-liveness.md)及 [10](issues/10-warm-session-liveness.md)。这是暖会话缺陷，不能并入冷恢复能力缺口；原事故无退出原因，归因保留 unknown。

2026-09-30。起点 `1913abe`，分支 `main`；已有未提交 `package.json` 的 packageManager 变更（10.5.2 → 12.8.1）保留，不纳入本轮提交。实际 HEAD/工作树与验证优先于历史路径。

## 2026-10-02 下一阶段授权与本轮切片

用户明确要求按相关文档开始下一阶段开发，以合理角色、数量的 subagent 并行推进；中断后明确要求继续完成。起点 `a338162`，保留本机环境对齐已有未提交改动。本轮继续 M2：实现 05a 原生队列文本管理、05b 当前 Thread 后续子 Agent 配置，核实 06a 冷恢复执行所有权并整合基础主流程候选。共享协议由主 Agent 统一接线，各角色按专用模块分工。沿用 TDD、原生所有权和必要隔离 SDK/GUI 验证；本地 commit 可沿用 M2 交付授权，不将此前特定修复 push 扩大为本轮 push。

交付与验收：队列真实身份/消费竞争、关窗保留编辑暂缓、修改记录与 unknown 不重试；并行 Thread 子 Agent 默认隔离且不改共享配置；组合检查后交付可识别候选供用户复试。尚未接入的附件编辑继续由 04/05 覆盖，不把纯文本增量当完整 V1-04/05。真实个人认证与付费供应商请求本轮未获明确授权，隔离 fixture 可继续。

冷恢复：固定 SDK 若不能证明所有执行入口全周期单写，保持 D-24 只读；显式历史上下文承接为新 Thread 的语义需另行对齐，证据核查不自行改变产品策略。此项不阻塞 05a/05b；S3 退出放弃待决、不公开发布、不扩 M3 保持。

## 推进与交接

- 授权：用户明确正式开启 M2，包含文档、源码、测试、工程配置、macOS GUI/原生验证、候选包与分批本地 commit；不 push、不公开发布、不扩 M3，不需逐票重复授权。
- 交付：按 [V1-00–10](../../docs/product/first-release.md#首版-m2-验收清单内部-m1-是子集见基础契约-8)逐功能完成，优先可重复配置、认证、模型、项目与 Thread 主流程。接续 [S5 体验反馈](../m1-s5-combination-acceptance/spec.md#2026-09-30-体验反馈与完成口径)，M1 工程完成不等于用户认可。
- 已定：D-02–D-08、D-10/D-11、D-20–D-27、D-28–D-37；沿用 OMP 执行、队列、原生历史、配置与凭据所有权，App 草稿/冻结原文/收据事务不改变。
- 重要待决：无新增。[S3 09](../m1-s3-control-recovery/issues/09-quit-discard-decision.md)退出放弃队列待决，仅暂停对应出口；缺全周期单写证据的冷恢复只读，提供明确新建独立 Thread 出口，不冒称恢复旧执行。
- 工程：正在实施；既有正确路径复用当前相关证据，新增缺口先失败行为测试。测试隔离 App 数据、OMP 配置、HOME、Git 配置、项目及网络；不继承个人凭据。真实供应商缺账户/费用授权仅暂停实测，不阻塞薄桥接及 fixture 验证。
- 用户试用：当前交付 `0.1.0-m2.13 / 7f5d5909-ac115847`、源码 `7f5d590`，18项实际干净包内检查及ZIP同源验证通过；用户认可 pending。[精确身份、哈希、证据和步骤](content-preparation.md#候选与试用)。m2.12及更早反馈/失败包保留历史证据，每段可操作体验给出对应源码和包身份；Agent验证不替代用户认可。
- 继续边界：本授权内持续实施，不重做基建审计。重大产品/权限/数据合同变化才对齐；签名、公证、公开分发及 M3 不纳入。

## 首版覆盖与近期任务

| 票 | 路径 | 结果/验收 |
| --- | --- | --- |
| [01 项目与 Thread](issues/01-project-threads.md) | V1-03/09 | 随时打开项目、新建/切换 Thread，切换先保存且不停止后台；冷重开列表与只读恢复，身份/草稿/回执隔离 |
| [02 配置、认证与模型](issues/02-configuration-models.md) | V1-01/02 | 同一原生配置上下文，已有配置复用，两条原生认证、取消/重试及实际模型/档位选择；秘密不落 App 数据/日志 |
| [03 主流程候选](issues/03-entry-candidate.md) | V1-10 | 清晰流程、真实 macOS 包/原生/GUI 验证、可重复隔离试用与对应 SHA |
| [04 输入与附件](issues/04-input-attachments.md) | V1-04 | 结构粘贴、@ 文件、截图/拖入/文件/PDF、预览/缩放/删除/重排、真实编码预检，无静默丢失 |
| [05 队列与子 Agent](issues/05-queue-subagent.md) | V1-02/05/06 | 原生队列编辑/删除/重排消费竞争，Thread 子 Agent 覆盖与并行隔离、状态/结果观察 |
| [06 阅读与组合验收](issues/06-reading-acceptance.md) | V1-00/07/08/09/10 | 长输出/复制/阅读保留、来源 Diff、恢复、固定负载与故障、最终 macOS 候选，逐路径实际证据 |

近期接口与方法由 Agent 按当前源码细化；后续票可按实际需要拆分，不为全部风险先建验证项目。V1 只有实际完成并验证的组合可标通过。

## 入口工程记录（2026-09-30）

已实现重复打开项目、同目录新 Thread、持久列表/切换、切换前草稿保存及独立后台 scope；原生配置摘要、两条认证桥接和当前 Thread 主模型/档位。待 macOS 包内/GUI 验证，01/02/03 仍进行中。子 Agent 覆盖及 V1-04–08 增量仍待实施，未把主模型接入标成 V1-02 全部完成。

当前行为测试 404 通过、1 项既有跳过；6 个类型入口、设计/i18n lint、模块/文档门禁、32 个架构与 40 个工具测试通过。实际原生认证 fixture 已验证无个人凭据、GET 校验、失败保留旧 key 和模型刷新。完整 `pnpm check` 的工具门禁未通过：此主机 Node 24.19.0 与 `.node-version` 24.21.0 不一致；另有用户原有 packageManager 12.8.1 修改，工程仍使用锁定 pnpm 10.5.2。没有降低门禁；构建已通过，正式候选从 clean commit 构建。

### 2026-10-01 实际 GUI 修正

第一入口 commit `9cb59c2` 的包内双 Thread/模型/草稿/重连路径已运行；原生打开第二项目与取消均有效。Computer Use 真实系统输入法观察到 `ni` 组合、空格确认 `你`；已就绪 A 的 `hao` 组合中 Return 只确认原文，没有发送（隔离 DB 仍仅两条原提交）。这只覆盖代表性输入，未代替完整 IME/引用/流式矩阵。人工检查超出原 5 分钟 checkpoint，harness 因超时退出，未借此前中间状态宣称冷恢复路径通过。

截图发现入口说明/模型区域挤压输入，随后收紧布局：模型切换与配置来源可展开，项目标题/目录保留，文件/Diff 折叠入口，编辑器默认高度降为共享 token；不重建编辑器。将从修正 commit 重新生成候选并继续包内与原生验证。

实际 m2.1 clean 包 `a9a5d1b` 的完整隔离 harness 已通过：双并行原生 scope、不同模型/档位、独立消息/草稿/身份、Renderer 刷新无重发、冷旧记录只读及新 Thread 出口。第二轮原生操作确认 OpenAI 原生挑战/授权码提示与取消释放（没有打开供应商浏览器或提交真实凭据）。发现浏览器挑战被后续提示覆盖、输出增长仍把输入推走；按失败测试修复挑战保留/重连，并把 Composer 固定在独立阅读区下方，继续生成 m2.2 候选验证。尚未交付用户，用户认可 pending。

阅读区检查在 m2.2 实际失败（高度 0），m2.3 为 78.8px；后续收紧默认编辑高度及设置预算，候选需同时验证输入/发送可达与阅读非零。阅读视图保留挂载及各自滚动，不因切换卸载文件/Diff 或 Composer。结构化文字粘贴增量接入后，全量行为测试 411 通过、1 项既有跳过，6 个类型入口及设计/i18n/架构/文档门禁通过。标题/列表/表格/链接/代码/引用可编辑并撤销；复杂跨行列单元格保留可编辑 HTML 源以免丢失拓扑。附件粘贴当前显式阻止整项并保留原草稿，附件内容导入尚未完成。

### 2026-10-01 首批交付

已交付 `0.1.0-m2.5 / 6fa03c6f-dd83e59d` clean macOS arm64 候选，详见 [交接](handoff-entry.md)。M2 工程 in-progress、trial delivered、acceptance pending；用户未回复不构成认可。01 声明的独立 Thread 入口工程与验证完成；02/03/04/05/06 的未完成范围保持进行中/开放。最后样式收紧的包内验证和截图通过；Mac 锁定只阻塞追加原生窗口操作，不阻塞独立工程。继续源选择修复、子 Agent/队列、@/附件及阅读/诊断组合，不 push、不扩 M3。

2026-10-01：首批交付后的显式纯文本粘贴修正已进入 `0.1.0-m2.6 / 9bd6a6da-73a3242a` clean 候选，包内双 OMP/模型/草稿/重连/冷只读完整通过，ZIP 完整性及其中 app.asar 与源码构建一致。当前交接更新为 m2.6，旧 m2.5 ZIP 保留快照。仍未用户认可。


### 2026-10-01 共享配置回归修复

用户报告 CLI 已登录但 Electron 读取不可用，明确要求查根因、追查此前漏检并验证反向共享。已纠正将正常 WAL 一律视为不可读和遗漏原生缓存模型的工程限制，保留原生配置/认证所有权；双向正常场景纳入常规 check，partial 保留原因诊断。已交付 m2.8 clean 候选 `0243e4a0-1e4354ec`，源码 `0243e4a`；实际包内 Bun/SDK/官方 CLI 双向验证通过，本机原生根只读采样完整、OpenAI已认证、gpt-6.1-sol可用。完整检查453通过/1既有artifact跳过。根因、漏检与身份见 [修复交接](configuration-sharing.md)。真实供应商生成和用户复试未认可，M2其它能力未因此完成。

2026-10-01：用户实际 m2.8 试用否定当前主流程可用性，明确要求实际操作与缺口修复。反馈、根因和本次范围见 [主流程修复](mainflow-feedback.md)；工程仍 in-progress，试用改 feedback，用户未认可。

2026-10-01：用户补充先检查实际应用是否匹配文档进度，未开发能力不提前开启。[核对](progress-audit.md)基于先前文档 77385a7 与实际交付 m2.8：基本独立新会话闭环已存在且包内重验通过；冷旧 Thread 只读符合合同，但入口、模型状态和 Shift+Enter 未充分兑现已承诺体验。01 重开 claimed；CLI 历史自动发现未声明完成。本地 m2.9 有新增历史发现代码及局部修复，但包内启动故障根因未知，不标交付。此次不展开其它 M2 能力。

2026-10-01：按用户要求全量 review 最近七提交，确认并修复 ACK/idle 提前释放未决提交、Runtime 跳过断开后的组清理、CLI 历史刷新沿用失效游标、官方拒收缓存后仍标完整四类缺陷。新回归先失败后通过，完整准入 464 行为测试/1 既有 opt-in 跳过、32 架构/47 工具测试及实际 SDK/配置验证通过；clean m2.9 review 候选 `18a6ef6a-10ca9182` 八场景包内闭环与 app 内配置验证通过。[范围、合同、证据与下一阶段 prompt](../review-seven-commits/spec.md)。无新增产品决定，不将本次审查当成 M2 全集完成或用户认可；原启动失败未复现但根因仍 unknown。


### 2026-10-01 会话切换连续性反馈

用户以 `0.1.0-m2.9 / d7412cea-c01373c5` 反馈切换历史 Thread 时闪烁，明确授权接续已承诺基础主流程、TDD、实际桌面验证、本地提交和候选；不 push、不公开发布、不扩附件/完整队列/子 Agent/M3。起点 `d7412cea`，工作树干净。

基线实际包复现 Thread 页面在 Main 确认与路由提交之间被清空；公共壳和 Outlet 已存在且保持挂载。按失败行为回归保留并冻结旧路由匹配的工作区，身份对齐后替换；未知选择仍撤下工作区。另按失败回归保存每 Thread 的阅读坐标，不保存或重建 OMP 内容。完整工程检查 480 行为测试、33 架构、47 tooling 通过，1 项既有 CLI artifact opt-in 跳过；候选包尚待实际桌面验证。具体证据、构建和试用步骤维护于 [切换连续性交接](navigation-continuity.md)。重要新产品待决：无；工程通过不构成用户认可。


首个连续性候选的实际包验证拦住隐藏阅读面板坐标覆盖的回归，未交付；补 DOM 边界失败回归并修正，完整工程检查更新为 481 行为测试通过。最终 clean 包仍待验证，具体失败与修复见连续性交接。


第二轮实际包继续拦住跨 Thread 阅读坐标恢复过早的缺口，按新失败回归修复挂载时序；原位置精确断言保留。完整工程检查更新为 482 行为测试、33 架构、47 tooling 通过，固定 CLI opt-in 仍跳过。最终候选等待包内验证，不将前两次失败包交付或视为认可。


2026-10-01：最终 clean `0.1.0-m2.10 / c00f3dc5-e027fc01` 已交付，实际 14 项包内检查和 Computer Use 原生窗口抽查通过；7 次切换、42 帧和16 DOM mutation 均未出现基线工作区空白，阅读坐标精确恢复。ZIP 完整性及内部 app.asar 同源核对通过；482 行为、33 架构、47 tooling、build/pack 与固定环境通过。基础项目/Thread 01 工程闭环 resolved；02/03 及其它 M2 未完成范围保持原票。M2 engineering in-progress / trial delivered / acceptance pending，不 push 或公开发布。[本轮交接](navigation-continuity.md)。

2026-10-01：用户最新反馈切换会话仍有整页闪烁，01 重开 claimed，当前 trial 改为 feedback，acceptance 继续 pending。用户要求先在 `pnpm dev` 开启 DevTools 开关并安装官方 React 扩展，已接入开发菜单和扩展加载，并实际打开窗口验证 Components 组件树；见 [开发调试工具](development-tools.md)。本轮未处理闪烁根因或交付新候选，既有 m2.10 采样保留为历史证据，不覆盖新反馈。

2026-10-01：用户明确要求消除闪烁、保留正常操作，并取消新 Thread 的第二次 OMP 启动点击。当前源码已移除偏好保存的全局 busy 和父级渲染传播，语言 Context 分离；新 Thread 在既有项目授权确认后自动启动，首次明确授权接续启动。恢复旧会话的执行策略不变。当前 500 行为测试及原生 Electron 六场景通过；实际 OMP 包复核与限制见 [本轮记录](rendering-isolation.md)。当前 trial 仍 feedback、acceptance pending，未将历史 m2.10 替换为未经验证的新候选。

2026-10-01：用户进一步明确要求修复 check:fast 锁解析阻塞并完整 commit/push；本轮 push 已获授权，取代前述本地限制。复用结构化 importer 读取支持 pnpm 12 的 pnpm/@pnpm/exe manager 文档，同时保持应用锁一致性和严格 manager 版本校验，11 项回归及 check:fast 通过。完整工程与远端状态见 [本轮记录](rendering-isolation.md)。用户体验认可与 M2 未交付范围不变。

2026-10-02：本轮05a/05b/06a工程完成，clean m2.11候选交付；591行为、34架构、59工具、16项实际macOS包内检查与ZIP同源验证通过。[精确身份、证据、限制和试用](next-stage.md)。M2未完成范围与用户认可pending保留，原环境对齐未提交改动不纳入本轮commit，不push。

2026-10-02：用户授权独立 subagent review，并修复发现的高价值问题。两名 reviewer 确认两项队列 P2，已按 TDD 修复并独立复核通过；完整检查及替代候选验证继续完成，旧候选证据保留。[本轮审查](queue-configuration-review.md)。无新增产品待决，用户认可仍 pending；不扩展附件与完整队列范围。

2026-10-02：独立review两项P2已修复并复核，clean m2.12替代候选交付；602行为、34架构、59工具和17项实际macOS包内检查通过，ZIP CRC与app.asar同源核对通过。见[本轮审查交付](queue-configuration-review.md#修复候选与试用)。m2.11保留历史快照，用户认可pending，原环境对齐未提交改动保留，不push。

## 2026-10-02 附件引用与完整队列接续

当前用户明确授权继续04/05，从成熟Agent交互细化最近可交付切片，安排3个职责与文件边界明确的subagent，主Agent接口整合与验收。交付范围为[04a](issues/04a-content-preparation.md)和[05c](issues/05c-queue-content.md)：私有附件准备/预览/管理、发送时文件引用冻结、实际模态及输入预算准入、原生队列混合内容编辑。正式GUI与无头逻辑一并交付；TDD、必要检查、隔离macOS验证、独立review及修复、可识别本地候选与commit均在授权内，不push。

原有README/环境门禁及其工具测试/.scratch/environment-dependency-alignment改动完整保留，不纳入提交。OMP执行/队列/历史所有权不变，unknown不自动重发，冷旧Thread只读，不扩M3。无新的实质产品待决；PDF实际表示与覆盖以固定SDK/本应用验证为准，不能隐藏降级。04a/05c工程完成，clean m2.13已交付待试用，用户认可pending；父04/05及M2未完成范围保持。

2026-10-02：04a/05c已完成无头逻辑、正式GUI与独立审查问题修复；654行为、34架构、65工具、18项实际clean macOS包内检查及ZIP同源校验通过。新候选源码7f5d590，构建7f5d5909-ac115847；[试用与验证限制](content-preparation.md#候选与试用)。本地提交，不push，原环境对齐改动保留。PDF当前需明确仅文字、完整视觉/OCR与B4回收未完成，05完整子Agent生命周期仍开放，M2用户认可pending。

## 2026-10-06 生命周期切片

用户要求使用刚合并的 AI 工作流，从最新 main 重新开启下一阶段；2026-10-06 已确认 PR #1 合入，基点 `c8dbdbadf1a04ad2be54e01f1a509024c5d982ea`，集成分支 `codex/m2-lifecycle`。本段选择 B4 附件引用/延迟回收/一致性与原生子 Agent 状态/结果观察两条可独立交付路径，随后集成与本地候选。沿用已有 M2 本地实现/commit/试用候选授权；不 push、不公开发布、不扩 M3。冷旧 Thread 只读、unknown 不自动重发，PDF 视觉/OCR与退出放弃原待决不进入本段。无新增产品待决。

```implementation-plan
[{"id":"m2-lifecycle","tickets":["04b","05d","06b"]}]
```

- [04b](issues/04b-attachment-lifecycle.md)：私有内容引用/最后释放、延迟回收及正式检查/清理出口。
- [05d](issues/05d-subagent-observation.md)：固定 OMP 原生子 Agent 身份、状态与可得结果的有界观察。
- [06b](issues/06b-lifecycle-candidate.md)：主 Agent 集成、双轴独立评审、检查、候选与本地 PR body。

主 Agent 单写管理状态；两名 implementer 在独立 worktree 从固定 integration SHA 开始，允许写集分离，公共模块清单/状态/版本/validation 由主 Agent 整合。工程/候选/用户认可分别记录，父04/05/06未完成范围保持；本段未宣称 M2 完整验收。
