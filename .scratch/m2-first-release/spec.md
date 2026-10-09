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
    "current": false,
    "build": "0.1.0-m2.20 / 3c4c1060-8b550d60",
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
      "content-preparation.md",
      "lifecycle.md",
      "lifecycle-review.md",
      "project-references.md",
      "project-references-review.md",
      "long-reading.md",
      "long-reading-review.md",
      "diagnostics.md",
      "diagnostics-review.md",
      "../ai-workflow-v13/m2-retro-handoff.md",
      "attention.md",
      "attention-review.md",
      "progress-2026-10-06.md",
      "real-provider-e2e.md",
      "pr4-integration.md",
      "reading-loop.md",
      "reading-loop-review.md"
    ],
    "next": "m2.20诊断/提醒候选已交付，PR#4已合入main，后续从最新main开始UI迭代；首次本机OpenAI GPT-5.6 Luna新Thread真实生成/GUI阅读完成。M2尚未完成，PDF视觉/OCR、01c系统显示/点击、V1-00/B6组合、其余真实账户/供应商路径及用户认可保持开放；冷旧Thread只读",
    "constraints": "2026-10-06最新授权先push并处理远端PR/提交、让main干净供后续UI开发；允许整合、验证后合并PR#4。不公开发布、不扩M3，冷恢复只读，unknown不自动重发；用户认可pending。"
  },
  {
    "id": "long-reading-loop",
    "title": "首个长会话阅读闭环",
    "phase": "M2",
    "engineering": "complete",
    "trial": "delivered",
    "acceptance": "pending",
    "current": false,
    "build": "Dev c04e245 / Chromium d987f98",
    "pending": [],
    "evidence": [
      "reading-loop.md",
      "reading-loop-review.md",
      "reading-loop-pr.md"
    ],
    "next": "首个长会话阅读闭环已本地PR合main并push，远端源码289d36d已核实；从main pnpm dev试用。R1–R15、双轴无高价值遗留、真实Luna/Dev及干净Chromium证据已交付；用户认可pending，M2父范围仍开放。",
    "constraints": "2026-10-07当前明确授权本地PR合main并push，允许现有OMP Luna与并行工作。live/native分源，预算和冷恢复只读保留；不公开发布、不扩M3。"
  },
  {
    "id": "long-session-repair",
    "title": "长会话连续体验修复",
    "phase": "M2",
    "engineering": "complete",
    "trial": "delivered",
    "acceptance": "pending",
    "current": false,
    "build": "Dev source c4bc00b",
    "pending": [],
    "evidence": [
      "long-session-repair.md"
    ],
    "next": "本地Dev三项修复已交付，两次冷恢复及真实模型/GUI/双轴评审通过；等待用户复试认可，M2其它项保持。",
    "constraints": "2026-10-08用户明确授权修复并取代手动分段及冷旧Thread一律只读边界；保留unknown不重发、原生身份与真实独占，允许本机真实模型复核；本地交付，不自动push或公开发布。"
  },
  {
    "id": "seamless-sessions",
    "title": "会话默认流程体验",
    "phase": "M2",
    "engineering": "complete",
    "trial": "delivered",
    "acceptance": "pending",
    "current": true,
    "build": "Dev source f795b82",
    "pending": [],
    "evidence": [
      "seamless-sessions.md"
    ],
    "next": "默认历史与按项目整理、重复新建免授权免手动启动、CLI 原会话续问和冷重启续问、生成中阅读已完成正式 GUI 与真实模型复核；等待用户复试认可。",
    "constraints": "2026-10-08用户追加授权 CLI 原会话继续，取代 CLI 来源统一只读；首次陌生目录信任保留，unknown不重发，外CLI占用不强占；本地交付，无远端操作。"
  }
]
```

2026-10-06：用户明确授权用本机 OMP 的 GPT Luna 在独立 Thread 验证真实回答；已用现有 m2.20 正式候选与本机原生认证完成一次最小生成，GUI、原生历史和 completed 收据一致，见[首次真实供应商闭环](real-provider-e2e.md)。此次独立 App 数据/空白项目，不改变全局配置；不扩大为工具、附件、多供应商或付费批量测试授权。02/03/06 余下范围和用户认可保持开放。

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
- 重要待决：无新增。[S3 09](../m1-s3-control-recovery/issues/09-quit-discard-decision.md)退出放弃队列待决，仅暂停对应出口。冷恢复现按下方2026-10-08授权建立私有会话全周期lease，打开原session ID/文件继续；unknown不自动重发，活执行或无法证实身份时不接管。
- 工程：正在实施；既有正确路径复用当前相关证据，新增缺口先失败行为测试。测试隔离 App 数据、OMP 配置、HOME、Git 配置、项目及网络；不继承个人凭据。真实供应商缺账户/费用授权仅暂停实测，不阻塞薄桥接及 fixture 验证。
- 用户试用：当前交付 `0.1.0-m2.20 / 3c4c1060-8b550d60`，产品source `3c4c106`；PR追加竞态真实红绿、798行为/34架构/74工具、双轴复核、17项修复后实际干净包及ZIP同源通过。m2.19的真实关窗/Finder重开同Main无重发及system=failed为其独立历史证据，不外推到新包；01c实际显示/点击仍claimed，用户认可pending。[精确身份、哈希、证据与步骤](attention.md#最终候选与试用)。
- 继续边界：本授权内持续实施，不重做基建审计。重大产品/权限/数据合同变化才对齐；签名、公证、公开分发及 M3 不纳入。

## 首版覆盖与近期任务

| 票 | 路径 | 结果/验收 |
| --- | --- | --- |
| [01 项目与 Thread](issues/01-project-threads.md) | V1-03/09 | 随时打开项目、新建/切换 Thread，切换先保存且不停止后台；冷重开列表并在私有会话独占证明后继续原会话，身份/草稿/回执隔离 |
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
[{"id": "m2-lifecycle", "tickets": ["04b", "05d", "06b"]}, {"id": "m2-long-reading", "tickets": ["06c", "06d"]}, {"id": "m2-diagnostics", "tickets": ["06e", "06f", "06g"]}, {"id": "thread-attention", "tickets": ["01a", "01b", "01c"]}, {"id": "long-reading-loop", "tickets": ["06h", "06i", "06j"]}, {"id": "long-session-repair", "tickets": ["06k", "06l", "06m", "06n"]}, {"id": "seamless-sessions", "tickets": ["06o", "06p", "06q", "06r"]}]
```

- [04b](issues/04b-attachment-lifecycle.md)：私有内容引用/最后释放、延迟回收及正式检查/清理出口。
- [05d](issues/05d-subagent-observation.md)：固定 OMP 原生子 Agent 身份、状态与可得结果的有界观察。
- [06b](issues/06b-lifecycle-candidate.md)：主 Agent 集成、双轴独立评审、检查、候选与本地 PR body。

主 Agent 单写管理状态；两名 implementer 在独立 worktree 从固定 integration SHA 开始，允许写集分离，公共模块清单/状态/版本/validation 由主 Agent 整合。工程/候选/用户认可分别记录，父04/05/06未完成范围保持；本段未宣称 M2 完整验收。

### 派发归属

固定 worker 起点 `ade890c`；主 Agent 管 `codex/m2-lifecycle`，状态/模块清单/结构报告/版本与整段 validation。04b→attachment_lifecycle→`/Users/louistation/.codex/worktrees/m2-lifecycle-04b/d-pi`→`codex/m2-lifecycle-04b`；05d→subagent_observation→`/Users/louistation/.codex/worktrees/m2-lifecycle-05d/d-pi`→`codex/m2-lifecycle-05d`。两者同起点、不同目录与写集，领取后不追赶 integration tip。

04b 写集：input/attachments、platform/main/storage、attachment IPC/service/preload/GUI、附件集成测试、i18n ui 与 shared/messages、输入/存储模块说明。05d 写集：conversation、execution Host、OMP 协议/资源、runtime 观察适配、SDK 准备、reading 子Agent视图、i18n domain、原生观察测试与模块说明。工作台挂接/共享样式/公开依赖清单由主 Agent 合并；新增共享合同需求先反馈，禁止 worker 写 spec/票状态/看板。

### 2026-10-06 工程与候选交付

04b/05d/06b resolved：基于已合并main完整执行固定起点worker、串行集成、真实失败回归、两轴独立review/修复/复核、完整工程与实际macOS候选。产品源码c5e424d、clean构建c5e424da-f02704bc；691行为/34架构/70tooling、固定SDK及22项实际包内检查通过，ZIP CRC与app.asar同源核对通过。[交接](lifecycle.md)、[评审](lifecycle-review.md)、[本地PR body](pr.md)。本地提交未push，默认Node24.21.0/pnpm12.8.1已对齐；父04/05/06及M2未完成范围保持，真实供应商与用户认可pending。

## 2026-10-06 文件与目录引用优化

用户明确要求优化@目录选择、文件/目录区分与性能，接续本地da9920d，[04c](issues/04c-project-reference-search.md)。沿用D-10/D-24/D-33/D-35/D-37；发送冻结与权限不变，目录参照固定OMP的直接条目清单，不递归读取全部正文。默认本地实施/commit/验证/候选，不push。当前m2.14保留已交付快照，04c验收后单独记录；不是重做已完成生命周期或开启PDF/OCR。

2026-10-06：04c resolved。typed目录/文件引用、目录优先有界索引、150ms查询合并、目录直接清单冻结和schema10围栏完成；最终source31cb912 clean m2.15，711行为/34架构/70tooling、20,001条目测量、两轴独立修复复核及24项实际包内检查通过。[交接](project-references.md)、[评审](project-references-review.md)。M2整体仍in-progress/trial delivered/acceptance pending，不将父票其余范围或另一交互策略WIP标完成，不push。


## 2026-10-06 长输出分段阅读切片

本轮用户明确要求按已合并工作流继续下一段可用M2。基点 `df41925401d6f64cfe4ea73432ca00523f7a5a94`，沿用干净 `codex/m2-lifecycle`。选择V1-07当前可达缺口：实时/历史/子Agent长正文全量送入Markdown导致主列表及DOM膨胀。交付有界正文阅读、完整已取得原文复制及流式追加时已读分段/选择保留；不改变OMP历史/Host预算/水位，不以截断正文冒称全文。PDF完整视觉/OCR与父票组合验收另留；本段无新增重要产品待决。冷旧Thread只读、unknown不重发、退出放弃队列待决保持。授权含本地实现/提交/隔离SDK和实际GUI/本地候选，不push、不使用个人凭据或真实供应商付费请求，不扩M3。

- [06c](issues/06c-bounded-long-reading.md)：长正文有界分段、正式实时/历史/子Agent接入，TDD与交互回归。
- [06d](issues/06d-long-reading-candidate.md)：整段双轴独立评审、实际SDK/GUI包内验证、本地候选和交接。

主Agent单写票/规格/生成看板/依赖报告/版本及候选；06c implementer在独立checkout固定起点实施，06d由主Agent串行集成验收。交互策略worktree不纳入本段。完整M2性能组合（3Thread/10000消息/30分钟/IME/故障全集）仍开放，本段仅验证受影响的长正文路径。

派发：06c→bounded_reading→`/Users/louistation/.codex/worktrees/m2-long-reading-06c/d-pi`→`codex/m2-long-reading-06c`，固定起点`88e40303b1b13707e5717818df19ccf6ce3cd124`。主Agent沿用`codex/m2-lifecycle`负责validation/m2长正文harness及共享管理；写集不重叠。

2026-10-06：06c/06d resolved。实时/原生历史/子Agent长正文按8192 UTF-16 units或120行有界分段，已封闭段DOM/选择/段内滚动在追加时保留，完整复制当前已取得原文。实际包Copy暴露窗口写权限拒绝，TDD后仅允许当前WebContents/主框架/当前文档的clipboard-sanitized-write并复核双权限入口。产品source `c531558` clean m2.16，验证harness `3fdb25f`；723行为/34架构/70tooling、两轴独立评审及21项实际包内检查通过，ZIP CRC/app.asar同源通过。40784 UTF-16 units复制7段并恢复剪贴板；10MiB原生工具artifact已核实，但固定SDK先缩为41077 UTF-8 bytes头尾原文，GUI六段保留省略/artifact提示，不冒称Host收到10MiB负载。[交接](long-reading.md)、[评审](long-reading-review.md)。父06/M2仍开放，固定负载/系统IME/故障全集及PDF视觉/OCR未验，用户认可pending，本地提交不push。

## 2026-10-06 远端交付授权

用户明确要求“push，然后处理好相关的PR。随后给开启下一阶段的简短有力的prompt”。本次按完整PR收尾集成已有叠加PR #2（codex/interaction-policy→codex/m2-lifecycle），推送集成分支、建立本阶段到main的PR并在当前head检查通过后合并，核实远端main。该授权取代本阶段此前本地不push及交互策略此前不merge限制，不增加公开安装包发布、真实供应商费用或用户认可。

长正文与交互策略的历史冲突保留来源隔离key、完整复制heading及data-selectable三者；结构报告重新生成，补正式ReadingBody在中央选择策略下四主题/密度真实鼠标拖选和翻段验证。已有m2.16 ZIP仍只对应c531558产品source，不冒称含后续交互策略集成；本次不重打包安装包。远端结果见[PR交付记录](pr-delivery.md)。

2026-10-06：用户追加push/PR收尾完成。PR #2已合入2135856阶段分支；该head push/PR CI均success，PR #3已合并到远端main（mergeCommit6302ea6），本地main同步且无其它worktree改动。[远端状态与组合证据](pr-delivery.md)。仅交付记录后续文档提交；原m2.16 ZIP对应c531558、未重打包，M2及用户认可状态保持。

## 2026-10-06 基础诊断导出与故障反馈切片

用户本轮明确授权从最新main继续M2，优先V1-00基础诊断导出与故障反馈闭环、合理并行、TDD正式GUI、双轴独立评审修复、实际macOS验证、可用候选/证据/本地提交。已fetch核实main与origin/main同为`1c9c30a`且工作区干净，集成分支`codex/m2-diagnostics`。无新增重要产品待决；不扩M3，不自动上传、不使用个人凭据或真实供应商收费请求，本轮只本地交付。

复用Main日志与现有trace，支持时间/trace/Thread/Writer实例/operation/阶段及条数限制；只读扫描按文件/字节/行/耗时有界，不读取原生会话或崩溃dump。主进程控制本地保存对话框，导出白名单元数据与覆盖/坏行/脱敏/丢弃/退化信息，不包含路径、URL、秘密或业务全文。GUI提供全局入口及故障trace快捷入口、筛选/刷新、可读记录、导出与可复制反馈模板；反馈由用户审阅后自行提交。V1-00整体性能/监控全集与M2其它开放项不据此完成，用户认可独立pending。

06e读取器与06f正式GUI从固定公共合同基点独立worktree并行；主Agent承担合同、IPC/preload/保存服务、版本/验证harness/串行集成及06g候选。

派发：06e→diagnostics_reader→`/Users/louistation/.codex/worktrees/m2-diagnostics-reader/d-pi`→`codex/m2-diagnostics-reader`；06f→diagnostics_gui→`/Users/louistation/.codex/worktrees/m2-diagnostics-gui/d-pi`→`codex/m2-diagnostics-gui`；验证辅助→diagnostics_validation→`/Users/louistation/.codex/worktrees/m2-diagnostics-validation/d-pi`→`codex/m2-diagnostics-validation`。三者固定基点`4cf37b9`，代码/GUI/验证写集隔离。主Agent单写合同、IPC、preload、管理状态及集成。


2026-10-06：06e/06f/06g resolved。现有Main JSONL有界白名单读取、正式筛选/覆盖缺口/故障trace GUI、Main原生0600本地导出、可复制反馈模板完成。产品source `ba0e7df`、clean m2.17构建 `ba0e7df1-808e60b8`；751行为/34架构/74工具、两轴独立review与21项实际macOS包内检查通过，含真实保存/取消/剪贴板、Writer路径故障、损坏SQLite启动及8MiB预算。验证harness `49cfaa3` 仅修正初始采样等待，失败证据保留。ZIP CRC与app.asar同源通过。[交接](diagnostics.md)、[评审](diagnostics-review.md)、[本地PR body](diagnostics-pr.md)。整体V1-00/B6性能监控和父06/M2组合仍开放，用户认可pending；本地提交、不push、不扩M3。

## 2026-10-06 工作流回流后的继续入口

用户要求落实本轮retro、处理干净并留下正确的M2继续入口后停下。三项工程改进已落实，票04和验证归属[AI工作流spec](../ai-workflow-v13/spec.md)，不是新增M2产品功能；[接手说明](../ai-workflow-v13/m2-retro-handoff.md)记录真实基点、独立review、选定证据、现有候选资源恢复及其它会话分支。后续先核实本地HEAD、总看板和`codex/m2-thread-attention`所属会话的实际进度，再按当前明确范围继续，不能重复派发或用旧m2.11快照代替当前spec。父01/02/03/04/05/06与M2认可状态保持；本轮不启动下一阶段，不push或公开发布。

## 2026-10-06 多 Thread 提醒切片

用户明确要求继续按工作流完成下阶段。本轮从干净7c9e1fe继续，集成分支codex/m2-thread-attention，工作目录/Users/louistation/.codex/worktrees/a613/d-pi。选择已确认M2提醒策略：后台待回答/失败不抢焦点的可点击应用内提醒；正常完成默认仅完成/未读；用户显式开启系统提醒与可选完成提醒，系统不可用/拒绝/失败保留应用内事实。Main依据实际RuntimeView与SubmissionReceipt归纳展示，通知不成为执行/处理事实，不读取业务正文或改变OMP调度。

交付正式侧栏状态、应用内提醒、通知偏好与点击定位；Renderer reload/关窗后台保持Main观察，重复/迟到事件不重复提醒，过期点击展示当前状态不发送旧回答。优先通用Electron能力，不采用平台独占必需机制；macOS实际验证按已获系统权限表达送达限制。偏好归App SQLite；通知内容仅自有通用文案及受控Thread短ID，不包含路径、提示正文、答案或凭据。

验收：TDD实际投影/收据、trusted IPC/preload、SQLite偏好、真实React焦点/导航/隔离；完整受影响门禁、双轴独立评审/修复、实际macOS候选/ZIP同源与本地提交。系统通知显示/点击须实际证据，OS权限或前台限制准确注明，不以模拟适配器宣称实际送达。不开真实付费供应商/个人账户、不push、不扩M3；用户认可pending，PDF视觉/OCR、冷执行恢复/退出待决与完整B6组合不纳入本段。



01a Main提醒归纳/原生适配与偏好持久化、01b正式GUI独立固定公共合同并行；主Agent统一合同/preload/版本/管理状态，串行集成、01c验证与交付。具体派发映射在领取时追加。

派发：01a→attention_main→/Users/louistation/.codex/worktrees/m2-attention-main/d-pi→codex/m2-attention-main；01b→attention_gui→/Users/louistation/.codex/worktrees/m2-attention-gui/d-pi→codex/m2-attention-gui；固定公共合同基点3cbff7e。Main实现者写提醒协调/适配/IPC及偏好迁移；GUI实现者写Renderer模型/导航/正式视图及i18n。主Agent写preload、桌面装配、验证、管理状态与模块报告。

验证辅助→attention_validation→/Users/louistation/.codex/worktrees/m2-attention-validation/d-pi→codex/m2-attention-validation，同起点3cbff7e，只写实际SDK/包内harness，不领取01c。

2026-10-06 实机条件核实：固定Electron44.4.5的macOS系统通知使用UNNotification，官方要求应用签名；未签名构建可能触发failed且通知事件不可用。保留通用Electron适配、App提醒与类型化故障诊断；实际显示/点击证据单列，不把isSupported或开关开启当授权/送达。见[官方说明](https://www.electronjs.org/docs/latest/tutorial/notifications#macos)。不以模拟适配代替实机证据。


2026-10-06：01a/01b实现与受影响工程验证完成。最终产品source `9a8c2ee`、clean m2.18构建`9a8c2eea-7f1a67df`，795行为/34架构/74工具通过（2既有opt-in跳过），双轴独立评审/修复/复核及16项实际macOS包内检查、ZIP CRC/app.asar同源通过。失败详情裁切由实际截图发现，独立确认、真实React先红后修复并在新候选按所有裁切祖先几何/截图验收；原失败证据保留。[交接](attention.md)、[评审](attention-review.md)、[本地PR body](attention-pr.md)。实际原生检查因Mac锁定、未收到手动解锁确认而checkpoint超时，没有模拟observed/click；01c保持claimed，系统通知显示/真实点击、实际关窗/同App重开待验。不将本段或M2整体宣称完成，用户认可pending，本地提交、不push、不扩M3。


2026-10-06用户要求继续：Mac已解锁，m2.18实际原生关窗/同App重开保持Main身份、后台完成/未读及无重复请求；系统通知真实failed，显示/点击未成功，App回退保留。原生多提醒场景又确认应用内提醒无高度预算挤压阅读，01b重开修正；旧包实际几何先红（5提醒160px、readingHeight=0），新m2.19候选按共享控件token与独立滚动验证normal/compact/窄窗口，原生证据保留。不改变OMP/通知事实，不使用签名密钥或个人账户，用户认可pending。

2026-10-06最终继续交付：clean m2.19产品source48cd01cc/build48cd01cc-42704447，796行为/34架构/74工具通过。独立Spec/Standards复核关闭预算和迟到首次inspect两项P2；validation-only焦点采样恢复/新Thread编辑器就绪纠正均独立复核，生产source不变。外部harness adcd4d3对实际候选18项通过；五组9–10条提醒预算、阅读至少4行/完整Composer/草稿/末条内部滚动和原焦点恢复通过。真实后台、Cmd+W关闭/仍运行、精确Finder双击重开同Main且供应商无重发、冷启动偏好保存/旧Thread只读完成。ZIP CRC和source/受测副本/ZIP asar同源通过。01b重新resolved；01c仅剩真实系统显示/点击，本次system=failed、App回退反馈可见、根因unknown、未模拟callback，保持claimed。M2其余范围和用户认可独立开放；不push、不签名、不扩M3。[当前交接](attention.md)。

2026-10-06远端交付授权：用户明确要求先push本地内容、创建PR并核对，再报告M2整体和提供下阶段prompt。fetch核实origin/main1c9c30a是本分支祖先，初次推送f7dff7b含31个领先提交（基础诊断与多Thread提醒）；未含已在main的此前切片。创建[Draft PR #4](https://github.com/LouisGo/d-pi/pull/4)并attach当前任务；远端CI及整个真实PR范围增量双轴核对进行中，不以配置存在/PR创建宣称CI成功。仅push/建PR，未merge，不改变01c/M2/用户认可状态。[整体进度核对与推荐下段](progress-2026-10-06.md)。后续同步仅交接文档/评审证据，产品48cd01cc候选身份不变。

2026-10-06 PR核对新增Spec P2：切换pending旧Thread新提醒会错误已读。已真实Main/SQLite与React红绿修复（36相关通过），独立增量复核/完整门禁及修复后实际包验证待补。本次必要修复在“push/PR确保没有问题”授权范围内，不关闭01c系统显示/点击或M2父票。

2026-10-06 PR修复收尾：fixed3c4c106的Spec/Standards增量复核关闭P2、均无新增高价值发现，完整798/34/74通过，build及clean m2.20实际17项受影响包内检查/四组预算/冷偏好/旧Thread只读通过，ZIP CRC及source/testcopy/ZIP asar一致。原m2.19原生窗口/systemfailed证据保留独立身份，新包未重复inspect或OS显示/点击。最终交接/评审/生成结构报告同步后push PR#4；远端最终head的CI实时核实，不以首次f7dff7b CI通过代表后续提交。产品source保持3c4c106，01c/M2/user acceptance独立开放。

## 2026-10-06 UI 开发前远端收口

用户最新要求“先push，然后处理干净远程PR和本次提交，让main干净，后续开始写UI”。据此先push本地main的诊断/retro成果7031b96，复用远端PR#4，将main回流与提醒分支最后保存的真实供应商验证记录ff52823整合；独立双轴复核、必要本地检查与最终head远端CI通过后合并并同步main。此授权取代本阶段先前不merge限制，保留原始历史来源。[整合与结果](pr4-integration.md)。01c实际OS显示/点击仍claimed、M2整体和用户认可未完成；不新增UI实现、不运行真实账户请求、不签名或公开发布。

2026-10-06 UI前远端收口完成：先push main7031b96，PR#4更新为最终aa3f9d8，源级/管理级两轴独立复核均无高价值遗留，798行为/34架构/89工具、build与原m2.20同源ZIP的17项合并harness包内检查通过；最终head push/PR CI均success，已正常merge为99d3bfb并同步本地main。完成远端PR分支和本轮临时本地分支清理，未改其它会话checkout；最后仅提交本结果/看板并push。[精确结果](pr4-integration.md)。用户后续可从main开展UI；M2仍in-progress、trial delivered、acceptance pending，01c及其它父范围未被merge关闭。


## 2026-10-07 首个长会话阅读闭环（本轮授权）

用户依据《D-PI 长会话研究与实现蓝图》明确授权直接实现第八节，必要 research、真实本机 OMP GPT Luna 测试、并行独立工作区、全面相关 TDD、pnpm dev 实际 UI、独立 review；无高价值问题后本地 PR 合入 main 并 push。此授权取代该同范围历史本地/push 限制，不扩为公开发布或 M3。起点 main `6daf80ee25d8c45e03cb8ab1c8d7304f926ee187`，干净；蓝图 `7906f255` 的后续 UI 提交保留，main 原有 10 个未 push 提交不改写。

交付范围：live 列表回底、离尾新输出提示、raw 手动最新段、覆盖缺口经现有 Thread tools 历史入口并返回 live；用户接管、来源/生命周期隔离、真实 Markdown 完成态及相关故障路径。复用 Thread ReadingPositions（32 source/128 body）、真实 generation、8192 UTF-16/120行分段、history attempt；Main/Host/Bun 与8MiB/1000项/32ms预算不变，不猜 live/native 关联。布局沿用工具 Modal、消息独立滚动与 Composer dock。无新增重要产品待决。工程完成与用户认可分开，验收不自动完成父06或M2其它范围。

本轮 leaf：[06h](issues/06h-live-reading-loop.md)、[06i](issues/06i-body-final-render.md)、[06j](issues/06j-reading-integration.md)。集成 `codex/long-reading-loop`，工作区 `/Users/louistation/.codex/worktrees/long-reading-loop/d-pi`。06h 由 live worker 在 `long-reading-live/d-pi` / `codex/long-reading-live` 实施；06i 由 body worker 在 `long-reading-body/d-pi` / `codex/long-reading-body` 实施；均固定6daf80e。主Agent单写票/spec/看板、i18n、历史与集成证据，worker不合入集成。

验收 R1–R15 见蓝图；已正确行为补回归不伪造红灯，缺口逐行为红绿。实机验证回答 Chromium 几何/选择/最终语义及真实 provider 到达风险，纯DOM替身不足；操作覆盖完成或发现具体失败即停止扩大样本。

2026-10-08：首个长会话阅读闭环实现、相关TDD与合并最新main后的1062行为/35架构/96工具检查、build/fast、真实Dev Luna/历史与干净Chromium24项通过，两个独立reviewer最终72c5e77均无高价值问题。本地PR分支8081910合main为289d36d3dcef18e81fd8c4a31d15913a7487387f，push成功且ls-remote核实相同；06h/06i/06j工程resolved。本次交付不关闭M2其它范围或用户认可，不冒称固定包。[完整交接](reading-loop.md)。


## 2026-10-08 长会话连续体验修复（当前授权）

用户基于本地真实模型复核明确要求修复全部确认问题，并指定三个验收：不能分段展示，正文必须连贯；生成期间能访问历史会话和消息；冷重启必须继续原会话。此要求取代06c/06h/06i的手动原文分段策略及旧D-24冷只读交付限制；历史证据保持原样。沿用D-02 OMP所有权、D-24 unknown不自动重发/事务与身份规则、D-35/37/39技术合同。无新增产品待决；实现需建立原生全周期独占和同文件/会话ID恢复，不能新建替代会话伪装续作。

起点ae94bc0bed8deba6a005c8b5ec79b16aa02f9df4，原工作区干净，集成分支codex/long-session-repair。正式GUI连续阅读，不以关闭预算门禁应付；运行中读取已提交原生历史前缀，不能因尾部追加让旧页不可访问。正文重复、停止/失败/自动续写与正常事件误报和冷空态一并修复。

验收：缺口真实红绿；正式Main/Host/SDK身份与锁冲突、停止后继续、冷重启同sessionfile/id和上下文回忆、生成期间历史可读、长Markdown不退原文/没有分段控件、复制精确、旧位置/焦点保留；受影响检查、build和独立Spec/Standards评审。真实模型测试沿用本次账户授权和合成数据；本地Dev交付，不自动push/发布，用户认可pending。

工程状态：实施中；管理状态仅主Agent写入。06k由continuous_reading在`/Users/lou/.codex/worktrees/continuous-reading/d-pi`、分支`codex/continuous-reading-repair`实现，基点13efe95，b0e60cc已串行合入为6c8300f；06l由主Agent实现并提交f3a0669；06m由recovery_evidence在`/Users/lou/.codex/worktrees/cold-session-resume/d-pi`、分支`codex/cold-session-resume-repair`从13efe95实现。主Agent写合同/i18n/共享装配并串行集成。结果与试用见[交接](long-session-repair.md)。

2026-10-08连续体验修复交付：06k/06l/06m/06n工程resolved，产品源c4bc00b；b0e60cc、c674b1c/a8781dc/0ca6487按写集串行合入，独立Spec/Standards复核无剩余高价值发现。4新增真实GUI请求、1独立协议模型调用，两次同id/file冷恢复记忆正确、19,053字符/220行代码连贯且复制精确、生成中历史可读、停止可继续、432增量零差异。类型/build及受影响检查通过；全量矩阵既有CLI路径失败和PDF并行超时/单独复查结果详见交接，不冒称完整check绿。Dev交付，无push/发布；M2其它范围与用户认可独立pending。


## 2026-10-08 会话默认流程体验（当前授权）

用户指出原生记录手动读取、新会话手动授权/启动、CLI已有会话未自动按项目进入Thread三项体验缺口，明确要求“最佳实践优雅修复这些体验”。基点bd98fa8；本地分支codex/seamless-session-experience。沿用上轮连续正文、生成中可读和App私有同身份冷恢复，补齐默认流程，不扩其它M2范围。

交付：已有绑定打开即自动显示原生历史；已信任的实际工作目录自动准备OMP，首次允许执行直接接续启动，冷恢复无需手工启动；CLI原生目录只读索引按规范化真实cwd分组，一原生session一AppThread，幂等持久且不复制/拼接上下文。陌生目录一次显式执行信任保留；自动索引不授予执行信任，不启动所有导入会话。CLI外部文件无共享执行全周期单写证据时只读且表达原因，不伪装ready/新建替代会话。

验收：相关真实行为TDD、同身份/去重/持久恢复、历史不依赖执行准备、信任只确认一次且启动失败可重试、切换线程与后台生成不丢阅读/草稿；受影响检查、正式本地GUI/必要真实模型和独立Spec/Standards评审；工程与用户认可分开。不push/发布。主Agent单写规格、票与看板。

2026-10-08工程交接：默认流程代码、SDK资源与两轮真实GPT Luna冷恢复通过；Spec/Standards固定至d6df40a均无剩余已证实高价值问题。正式GUI因Mac锁屏受阻，06r保持claimed，工程partial/试用not-delivered/认可pending。来源、实际检查失败与续测路径见[默认流程交接](seamless-sessions.md)。

## 2026-10-08 CLI 历史继续提问（当前授权）

用户明确要求修复 CLI 历史只能阅读的问题并减少继续提问的阻断，取代上节 CLI 来源统一只读限制。已结束 CLI 的原文件经过当前配置/身份/目录检查后，在已信任项目自动准备并继续原 Thread；陌生目录一次信任保留。Main 持有原文件粒度的 d-pi 生命周期 lease，并在接入前识别外部实际 writer/项目内 OMP CLI；占用与未知保留历史和草稿，允许原地重试。外部 CLI 不参与该 lease，不能宣称阻止 GUI 执行期间另起不合作 CLI；不改写用户 CLI/启动器，不复制或 fork 原生历史。实施与真实验证见 [06s](issues/06s-cli-session-continuation.md)。无额外产品待决，用户认可 pending。

2026-10-08 CLI 续接交付：06s 工程 resolved，产品 f795b82；真实 CLI/SDK 与正式 GUI 同 Thread/ID/文件续问、冷恢复、生成中跨项目阅读通过。未知不重发，外 CLI 边界与失败记录见 [交接](seamless-sessions.md)。M2 整体与用户认可 pending，无远端操作。

## 2026-10-09 会话展示专项

用户明确授权按所给 Codex 消息参考图重做正式会话：用户气泡与 composer 对齐，多轮锚点及 hover 预览，打磨思考、生成、工具、任务、代码组件；普通会话以模型对话表达，底层引擎名称与技术信息隐藏在详情。起点 main `03fe044306d67bf1a6f9dc9ae93181241c8f668f`，工作区原本干净，当前目录串行实现。属于 M2 会话阅读与 Beautiful UI 设计体系的可逆呈现升级；不改变执行、权限、发送收据或原生历史所有权，无新增重要产品待决。

按 UserMessageBubble、MessageActions、MessageStatus、ThinkingDisclosure、ToolResultFrame、ConversationOutline 和代码适配拆分组合，并加入真实组件展台。用户原文保持字面与换行，模型长文连续阅读；动作 hover/focus 显露且不挤动内容；思考首次展开才解析，工具默认收起；失败/停止明确显示，底层详情保持可读。Outline 只索引已呈现用户行的稳定身份，浮层按需读取完整提问，通过已有阅读所有者定位，不建立第二份业务状态。真实原生 thinking 单独投影与读取，计入原有字节预算；固定 SDK 增量与完整快照不重复拼接，工具最终追加保留名字。原生文件只读、实时订阅及历史去重合同继续沿用。

对照用户参考图及 Beautiful UI 已登记的 MIT 固定来源 `44a274e598395ab61e7c96c26fda2758780253b7` 中 TaskRows 等写法，不复制整套外部组件或演示状态。项目 impeccable 的 Operate/Read 方向与共享 token、Base UI、自有 Icon Layer 对齐；外部 Streamdown utility 由专属适配层接回同源颜色、尺寸、圆角与精确复制。无新增依赖。

验证：气泡字面/复制、详情隐藏、thinking 快照/字节预算/按需解析、工具最终名称、轮次定位/键盘/流式更新不重扫、相关阅读/历史/组件行为共 141 项通过；Renderer/Host/Main 类型检查及 design/interaction/i18n lint 通过。隔离 macOS Electron 使用正式 App 与合成桥接，9 项实际检查覆盖深浅主题 1440/720 对齐、无横向溢出/普通画面无引擎名称、代码适配实际计算样式、hover/聚焦无布局变化、thinking 展开、问答预览边界、定位后继续生成保持位置及回到底部。[结果](evidence/conversation-display/result.json)。两轮截图观察后不追加第三轮；最后的代码工具栏适配与轮次点击区域由计算样式、几何及行为确认。截图是合成数据场景，不证明真实 provider、VoiceOver 或固定包，未重跑收费模型。Dev/diff 交付，用户审美认可 pending，未提交或 push，不关闭其他 M2 范围。


同日依据用户新增四项反馈继续优化：

- 新增 MessageMedia，发送图片及文件卡片位于用户气泡上方；缩略图保留尺寸、按可见区域读取，点击使用共享 Modal 预览。图像仅从已绑定的原生记录与冻结游标读取，图片字节不进入实时快照或历史元数据；跨进程延续同一 traceId，取消查询忽略迟到结果。沿用原记录 32 MiB 上限、身份与文件替换检查，原生文件保持只读。
- 保留原消息真实 timestamp，用户及模型回复的时间常显，复制仍在 hover/键盘聚焦显露；缺失旧时间不编造。文件名称/正文来自冻结提交与原记录的呈现等价核对，跨原生会话或有歧义时不推断关联；只读候选查询可越过最近 100 条收据窗口，不改变收据、执行身份或结果。文件预览不读取已变更的项目文件；缺失/重复/嵌入分隔符时明确无预览。无可核对来源的旧文件继续保留原文。
- Outline 改为细线与圆点，当前轮次用主题强调色，悬停与当前态区分；保留问答预览、键盘操作及定位后生成不抢位置。
- 正常作答只显示回复，不因 busy 产生顶部队列区；停止回复移入 composer，真实队列在输入附近按需展开，已确认的空队列隐藏。暂停的待发送消息保留显式继续，待答交互仍留在阅读区域。

本次累计相关测试 163 项通过（最终 trace 注入及跨进程读图复核对应 11 项再次通过）；Renderer/Main/Host/Preload/Core 类型检查通过。按项目 impeccable 的 polish 与共享设计体系进行了两轮实际截图观察，深浅主题 720/1440 的附件、时间、对齐与无顶部队列通过；11 项隔离 Electron 检查还覆盖 hover 无跳动、锚点/流式位置、文件与图片预览、composer 停止。预览弹窗和提示浮层的初次截图落在进入动画中，不作为静止态证据；最终用计算样式确认动画结束后的 opacity=1，不追加第三轮截图。[最终结果](evidence/conversation-feedback/result-final.json)。仍为正式视图与合成桥接的验证，未调用真实 provider 或验证固定包/VoiceOver；当前工作区 Dev/diff 交付，未提交或 push，用户体验认可继续 pending。


同日按用户追加要求将轮次预览由普通 Tooltip 改为可阅读的小卡片。共享 HoverCard 封装固定 Base UI 1.8.0 PreviewCard 的 hover/focus、鼠标连接、边界碰撞与 Esc；TurnPreviewCard 只呈现轮次和完整问题，ConversationTurnAnchor 组合触发与按需采样，ConversationOutline 继续只拥有索引、当前态与定位。每次打开才读取该轮已呈现的完整用户正文，保留原文换行，不截成 240 字或混入回复；长问题在卡片内滚动，不推动消息列表。只有附件的提问提供无文字提示，不加载附件来填补内容。HoverCard 与正式提问卡片组合接入组件展台。

本次新增缺口测试先失败再通过；相关轮次、消息展示与展台 18 项通过，Renderer 类型检查、design/interaction/i18n lint 与架构/文档检查通过。隔离 Electron 仅检查本次浮层：深浅主题 1440/720 的完整问题、边界、鼠标移入后滚动、焦点预览及 Esc 共 4 组通过；第一轮读取了进入动画中的坐标导致检查失败，等待稳定布局后确认鼠标连接正常，不将该失败记作产品缺陷。最终视觉与几何证据见 [结果](evidence/conversation-anchor-preview/result.json)。正式视图与合成桥接，无 provider 请求；当前目录 Dev/diff 交付，未提交或 push，用户认可 pending。


同日按用户最新截图纠正时间与已发送图片：时间取代上一段常显规则，和复制按钮共用 MessageActions 的 hover/focus 显露，不改变行高。图片根因通过用户实际三条原生记录确认：固定 SDK 将图像写成 `blob:sha256:<digest>`，旧读取器仅接受内嵌 base64，因此忽略了真实图片并留下 `[image: …]`。现在两种格式均产生按需图片元数据，由 SDK 官方 `getBlobsDir()` 提供实际 profile/XDG 根目录；Main 延续原生绑定、冻结游标和当前 Thread 校验，只读规范 digest 文件，拒绝符号链接、非普通文件、超过 32 MiB 或摘要不符的内容。可见缩略图共用短时路径查询，图像字节仍不进入列表快照，MessageMedia 与共享 Modal 保持组件边界。

新增 blob 元数据缺口测试先失败再通过；受影响 7 文件 43 项行为测试、9 项隔离配置适配测试、Main/Core/Renderer 类型检查及 design/interaction/i18n、架构/文档检查通过。隔离正式 Renderer 的 11 项检查确认时间/复制共同隐藏和 hover/focus 显露、无行高变化、深浅主题 720/1440 附件位于气泡上方并可预览；未追加截图。另以生产读取代码只读核对用户原三条记录，每条返回一张 116,311 字节原图并去掉占位文本，[结果](evidence/conversation-image-echo/result.json)。这证明实际存储格式和读取修复，不冒称正在运行的 App 已加载新代码：当前 Dev 持有 SDK 资源保护锁，Mac 锁屏导致无法正常退出；待用户解锁并退出 d-pi 后刷新 SDK 资源、重启 Dev。无新模型请求、原记录写入、提交或 push，用户认可 pending。


用户解锁后继续完成本段 Dev 交付：通过应用菜单正常退出旧实例，`pnpm runtime:sdk` 刷新固定 SDK 18.4.6 成功，资源 548.5 MiB / 650 MiB；`pnpm dev` 从当前目录重建 Main/preload 并启动，沿用原开发数据目录。正式原 Thread `cd6d1980-f0db-476b-ac11-9d23b61ca228` 保留 12 条消息与 Ready 状态；原图缩略图实际出现在气泡上方，无占位文字，点击打开原图预览，默认时间/复制隐藏，已观察模型回复时间与复制共同显露。CUA 的一次预览操作捕捉报错后，AX 确认预览已打开；不把捕捉失败当产品失败。随后用户在 App 操作，停止继续争用界面；hover/focus 无布局跳动仍由上一段 11 项隔离 Renderer 几何检查证明。原来的锁屏/资源锁阻塞已解除，[结果](evidence/conversation-image-echo/result.json) 更新为 Dev 已交付；未发送新的模型提问，不冒称固定包或用户体验认可，无提交或 push。

2026-10-09 最近两次提交评审修复：用户授权修复 `8ae367dd` / `7132d405` 的五项已证实问题，并明确要求不运行验证、由用户自行复试，代码审查后直接 commit 与 push。空队列的显隐独立于暂停恢复动作；轮次导航只保留 DOM 身份，打开的单张预览卡按帧读取并观察所属轮次，正文更新/最终替换不再复用旧摘要；正式回复有独立 DOM 标记，不从 thinking、工具或状态推断回复。键盘定位保留焦点，鼠标点击仍可关闭预览，鼠标离开不清除键盘焦点。schema 14 增加 execution 拥有的冻结收据派生查询索引，稳定身份及 message digest 复合索引缩小候选后仍核对原文；旧索引在迁移后补齐，新收据与索引同事务保存，before-v14 保留 schema 13。沿用 D-11、D-24、D-29、D-32、D-34，不新增产品决定或执行事实。相关既有测试来源随新合同调整，本轮未运行测试、静态门禁、构建或 GUI；旧证据不代表本次修复通过，用户认可 pending。


## 2026-10-09 中英文功能文案改写

用户确认完整“原文案 → 新文案”对照表，并授权直接修改、验证后 commit 与 push。起点 main `e483d25`，工作区干净，当前目录串行实施；953 项既有自有消息、264 个开发者文案位置与 6 个思考深度值纳入核对，不改变执行、权限、发送收据或原生内容。会话 / Thread、模型服务 / Providers 已确认；允许删除重复说明，开发者看板支持双语且技术名称保留，思考深度两种语言均保留原始值。

改写 Main 与 Renderer 共用文案，移除 9 项重复说明及其展示；组件看板、菜单、路由标题和嵌套预览跟随应用语言，示例状态保存稳定身份，切换语言不重置标签页或选择。产品术语与 D-36 / 导航合同同步；原生、用户及工具内容保持原文。不代表 M2 整体验收或用户试用认可。


本段工程验证：按确认表逐值核对两种语言，既有 953 项含 9 项删除全部一致，开发者新增 196 个共享消息，两种语言各 1140 个键且 ICU 解析通过。文案相关 30 文件 253 项测试通过；筛选排除的两项旧测试（runtime inspection 的 Stop 查找、开发者整页路由进入）仍在全量执行中报告，未增加 skip 或修改门禁。新增看板语言切换测试覆盖嵌套预览、按钮计数、新增标签页、导航/设置选择保留；此前固定中文的真实缺口先失败后通过。相关测试同步按钮名称、提示与确认区域选择；模型排序示例使用明确设备顺序，避免版本排序改变示例前提。

Renderer/Main/Core/Host/preload 生产代码类型检查、build、check:fast、i18n/design/interaction lint 及 impeccable 静态扫描通过。全局 typecheck 的 20 项旧测试/validation 类型错误，在起点归档具有相同位置和错误码；全量测试余下 8 项断言失败在起点用相同 Node 24.21.0 复现：5 项 schema 14 对旧 13 断言、1 项模型排序、上述 2 项界面测试。本轮完整矩阵的一次 SDK PDF worker SIGABRT，单独复查该文件 14 项通过；不宣称全量门禁全绿，也不扩大为旧功能修复。源码/diff 复核执行、权限、持久化与原生内容处理未改；当前目录 main 交付，commit/push 依本轮用户明确授权执行。未运行 GUI 或新模型请求，用户试用认可 pending。


## 2026-10-09 本地 QA 修复复核

用户明确授权本地修复、验证、commit 与 push；使用独立 `codex/qa-20261009` 分支，起点 fresh fetch 的 main 为 `7d49b4907b61fef0502b30f04308812f8905eaea`。原 QA 报告基线 `e483d25dabb857ad4d4c2843e155dbb105f4d100` 仅为历史输入；没有回退或覆盖用户 checkout。

Library 官方 prepare_materialize 已成功产生传输描述，但内置 helper 在本执行器下载阶段返回 HTTP 403；按受支持流程显式本地目标重试一次仍失败，此后停止。报告、ZIP 和原截图 32/55/65 未成功落地或读取，ZIP 摘要未核验；以下证据来自最新源码、本地回归和新实机截图，不能据此标记原 QA 全部验收。

修复与证据：

- SDK 新会话原来只分配文件名，在 Ready/binding 发布时空 session 尚未落盘。固定 OMP 18.4.6 的 `ensureOnDisk()` 在同一 session 上完成持久化后才交给 Host；失败拒绝启动，恢复继续核验真实路径/header ID/cwd。真实临时目录回归先 ENOENT 后通过；真实 Host 冷恢复探针覆盖 Ready 后未发送即正常退出、同 ID/路径/零消息重启，以及已有两条消息、错 ID、缺失文件、错 cwd、空历史文件、零模型调用。已有缺失文件 binding 无可靠证据区分从未落盘与历史被删除，保持明确失败和草稿，不静默换 ID、覆盖或重建。
- 收据生产者持有 `sessionFile`，历史候选查询/展示却使用 `sessionId`。统一 path canonical ref，保留 Thread/config context/正文/图片 digest 校验。真实 RuntimeService→SQLite→重开存储→生产历史 IPC/JSONL 链路测试使用不等于 ID 的路径、TXT+PNG，并断言错误 context/digest/body 不归并及草稿保留。旧显示回归先失败再通过。
- 三个共享 Dialog Portal 使用共同 layer token 提升整个 isolation stacking context；两种共享 HoverCard 入口关闭现存背景预览并拒绝背景打开。相同 Electron 回归在起点源码副本打开图片后等待背景 preview 关闭超时；修复后 [实机结果](evidence/conversation-modal/result.json) 8 项通过。覆盖亮/暗主题、1440/720 宽度、命中层级、背景 hover、遮罩、Escape、焦点回归、Settings 嵌套 Select 和分开关闭；已实际查看新截图像素。
- 在当前起点复现四个 schema13 旧断言和 favorites-first 旧排序断言，更新为 schema14/显式手动顺序；保留 migration backup/index 和排序相关保障。总门禁另外揭示既有测试类型/桥接/组件 mock/旧按钮名称及异步附件读取等待问题，补齐当前契约，不删除或跳过测试。既有局部尺寸改用同值集中 token/计算表达式；文档中不存在的历史日志链接明确标记未保存。SDK failure fixture 补齐官方 models 配置要求，保留零 provider 调用断言。

独立 Spec/Standards 审查及增量复核无有依据生产缺陷。OMP、依赖锁和架构边界保持原版本；没有 merge、部署、付费 provider 请求或修改用户真实数据。验证系统为 macOS arm64，实机为正式 Renderer 配合合成桥接；不补称 Linux 专属或真实厂商兼容验证。用户体验认可仍 pending。

最终本机结果：`pnpm check` 的类型、lint/design/i18n、设计/source boundary、架构/文档/生成报告检查、39 项架构测试和 144 项 tooling 测试通过；默认并发的最终全量阶段两次在 clipboard PDF worker `SIGABRT`（232 文件/1448 断言通过，1 worker 错误），不记为完整门禁通过。该文件单独 14 项通过；不改配置、不新增 skip 的 `pnpm test --maxWorkers=2` 完整运行 233 文件/1461 项通过，原有 2 项跳过。`pnpm check:fast`、`pnpm build`、`pnpm check:environment`、`pnpm validate:sdk`、真实 Host cold resume 和 impeccable 扫描通过（扫描无发现）。远端标准 CI 按推送后的确切 SHA 单独核对并在交付报告给出结果。
