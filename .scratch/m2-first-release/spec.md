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
    "build": "0.1.0-m2.17 / ba0e7df1-808e60b8",
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
      "diagnostics-review.md"
    ],
    "next": "06e/06f/06g基础诊断导出与故障反馈工程完成，m2.17候选已交付待试用；余下V1-00/B6性能与故障组合、M2开放项继续保留，真实供应商与用户认可pending，冷旧Thread只读",
    "constraints": "2026-10-06本轮从最新main继续M2，授权本地实现、候选、证据与提交；此前push/PR授权属于已交付阶段，本轮未push。不公开发布、不扩M3，冷恢复只读，unknown不自动重发；用户认可pending。"
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
- 用户试用：当前交付 `0.1.0-m2.17 / ba0e7df1-808e60b8`、产品源码 `ba0e7df`，21项实际干净包内检查、两轴独立review与ZIP同源验证通过；用户认可 pending。[精确身份、哈希、证据和步骤](diagnostics.md#候选与验证)。m2.16及更早交付/失败记录保留历史证据，每段可操作体验给出对应源码和包身份；Agent验证不替代用户认可。
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
[{"id":"m2-lifecycle","tickets":["04b","05d","06b"]},{"id":"m2-long-reading","tickets":["06c","06d"]},{"id":"m2-diagnostics","tickets":["06e","06f","06g"]},{"id":"thread-attention","tickets":["01a","01b","01c"]}]
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


## 2026-10-06 多 Thread 提醒切片

用户明确要求继续按工作流完成下阶段。本轮从干净7c9e1fe继续，集成分支codex/m2-thread-attention，工作目录/Users/louistation/.codex/worktrees/a613/d-pi。选择已确认M2提醒策略：后台待回答/失败不抢焦点的可点击应用内提醒；正常完成默认仅完成/未读；用户显式开启系统提醒与可选完成提醒，系统不可用/拒绝/失败保留应用内事实。Main依据实际RuntimeView与SubmissionReceipt归纳展示，通知不成为执行/处理事实，不读取业务正文或改变OMP调度。

交付正式侧栏状态、应用内提醒、通知偏好与点击定位；Renderer reload/关窗后台保持Main观察，重复/迟到事件不重复提醒，过期点击展示当前状态不发送旧回答。优先通用Electron能力，不采用平台独占必需机制；macOS实际验证按已获系统权限表达送达限制。偏好归App SQLite；通知内容仅自有通用文案及受控Thread短ID，不包含路径、提示正文、答案或凭据。

验收：TDD实际投影/收据、trusted IPC/preload、SQLite偏好、真实React焦点/导航/隔离；完整受影响门禁、双轴独立评审/修复、实际macOS候选/ZIP同源与本地提交。系统通知显示/点击须实际证据，OS权限或前台限制准确注明，不以模拟适配器宣称实际送达。不开真实付费供应商/个人账户、不push、不扩M3；用户认可pending，PDF视觉/OCR、冷执行恢复/退出待决与完整B6组合不纳入本段。



01a Main提醒归纳/原生适配与偏好持久化、01b正式GUI独立固定公共合同并行；主Agent统一合同/preload/版本/管理状态，串行集成、01c验证与交付。具体派发映射在领取时追加。
