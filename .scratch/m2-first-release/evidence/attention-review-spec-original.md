# M2 多 Thread 提醒：独立 Spec review

审查者：只读 Spec reviewer；未取得作者结论作为审查依据。

## 固定输入

- worktree：`/Users/louistation/.codex/worktrees/m2-attention-review-spec/d-pi`
- base：`7c9e1fee48ccb467db359a18401d8a30ca57a04e`
- head：`46121f1fcf5574724f2c023c8beda6374366dfee`
- 实际 merge-base：`7c9e1fee48ccb467db359a18401d8a30ca57a04e`
- 命令：`git status --short`、`git rev-parse HEAD`、`git merge-base <base> HEAD`、`git diff <base>...<head>`、`git log <base>..<head> --oneline`。
- detached committed 输入；起止工作区均干净，head 未变化。差异包含 132 文件（含历史 TDD evidence）。
- 要求入口：AGENTS.md、d-pi-code-review skill、docs/status.md、`.scratch/m2-first-release/spec.md` 最后提醒切片、01a/01b/01c、first-release.md 提醒策略、decisions.md D-11/D-24 细化、navigation.md 与相关 foundation contracts。
- 授权边界按当前任务：M2 正式 GUI/TDD、独立评审/修复、实际 macOS 候选与本地提交；不扩 M3、不 push、不用个人凭据/付费请求；用户认可 pending。

## 发现

### P2 / Spec：Router 与 Thread 对齐前提前消耗未读

位置：`src/app/renderer/wiring/model.ts:319`，`src/app/renderer/shell/attention.tsx:162`；实际清读位置 `src/app/main/wiring/thread-attention.ts:134-144`。

要求：`docs/architecture/navigation.md:33` 明确“已读仅在窗口实际聚焦、路由与已确认 Thread 对齐后提交 seen”；同段合同要求 Router 尚未对齐时保留 inert 的旧视图。

触发：前台 A 中点击后台 B 的提醒，Main 选择确认 B 后，`acceptRestore()` 发布 B 模型并立即发送 `visible(B)`。此时 `createDesktopHistory.transition()` 仍在等待 `admit()` 返回，history commit 尚未发生（`routing/router.ts:57-63`、`desktop-history.ts:44-45`），因此页面仍可处在 A/保留旧 inert 视图。Main 的 visible 不是纯可见身份记录，而会立即 `clearCurrentUnread()`。GUI effect 同样无条件发送 `visible(current)`，只对后续 seen 做 pathname/focus 检查，所以该检查无法保护 Main 的实际清读。路由/组件加载延迟或在此窗口关窗时，B 可在内容尚未呈现的情况下被标已读，应用内提醒随 unread=false 消失。

证据：本次仅静态调用链确认，未运行时放大时间窗。现有 `shell/attention.test.ts:72-88` fixture 只有 seen 改 unread，visible 不模拟 Main 的清读，因此“only focused current Thread can be seen”测试无法覆盖真实桥两端的这一缺口。

最小修复：删除 acceptRestore 中把“已选择”等同于“已呈现”的 visible 发布；由路由与模型对齐且窗口可见的绑定发送可见 Thread，失配/transition 时发送 null。可以保留 Main 的焦点核验；若 visible 只登记身份，则已读只由受控 seen 清除。增加真实 ThreadAttention+AttentionModel/Router 的集成回归，hold route commit，证明选择 B 后 B 仍 unread，直到路由对齐且 focus 时才清读。

### P2 / Spec：同一 trace 下新增待答请求被过宽去重吞掉

位置：`src/app/main/wiring/thread-attention.ts:299`（与 `186-191` 联动）。

要求：01a 要求“只在真实待答/失败/完成变化生成有界提醒”；`docs/product/first-release.md:170` 要求后台需要回答时给出应用内提醒，App 后台且显式开启时给系统提醒。重复事件应去重，新请求不应被当作旧事件。

触发：同一 Thread Q1 pending，用户访问它使提醒变为 unread=false，但未回答便切到另一个 Thread；原生扩展随后发出另一个 distinct ID 的 Q2，Q1 仍 pending。Host 支持最多 32 张并存交互（`host/interactions/interactions.ts:206-221`），publishInteractions 发送整个列表（`host/session-host.ts:163-172`），RuntimeService 接收交互只更新 interactions，保留该 RuntimeView 的 traceId（`main/runtime/runtime-service.ts:484-493`）。observeRuntime 正确检测到 Q2 的新 ID 并调用 add；add 却只比较旧 entry 的 kind 与 traceId，直接返回。Q2 不产生新 eventId、不重新变未读、不产生应用内提醒/系统通知。

影响：Q1 已看过不代表 Q2 已看过；当前行为会静默丢掉后台新增问题的提醒，Thread 一直停留旧已读状态，直到用户自行再次进入。即使只从 Main API 观察，`Q1 -> visible/foreground 清读 -> visible(null) -> Q1+Q2 同 trace` 的序列已可确定触发，非推测 smell。

最小修复：将 needs-answer 的事件身份包含 connectionGeneration 与新增 pending 请求身份/集合水位；真正新增请求可更新事件并重新置 unread，而相同快照/相同请求继续去重。避免为每个 Runtime revision 发提醒。新增 Q1 已读、切走、Q2 新增的行为回归，并覆盖同 trace/new generation；已有失败收据与 Runtime 同 trace 合并规则应保留。

## 覆盖与未验证

已检查生产差异与相关调用链：attention contract/desktop bridge；Main trusted IPC/source generation/Thread 准入；preload schema/reply trace；Main 生命周期焦点、reload、关窗与无窗口观察；desktop-services RuntimeView/SubmissionReceipt 接入；ThreadAttention 有界、revision/receipt 排序、generation、native callback、偏好与事件；Electron adapter；Renderer AttentionModel、侧栏/中心/偏好、Router 准入/并发/过期点击、workbench 定位和收据定位；SQLite schema11、preferences 读写、恢复前后迁移；i18n 通用内容；attention.mjs 与 package.mjs 的真实 SDK/localhost supplier、reload、后台/关窗/重开、native checkpoint、cold preference harness。相关新测试也已静态核对，历史 TDD 输出没有作为本次执行成功证据。

本 reviewer 未 install、build、复制 App、修改源码/管理状态或 commit。隔离 worktree 无 node_modules 且磁盘受限，因此未跑本次行为/类型/门禁；由主 Agent 执行并记录。未执行 actual macOS package、系统通知显示/点击、OS 权限、签名或 GUI 焦点实测；不得据此声称候选已经达到实机验收或用户认可。Standards 轴由另一独立 reviewer 负责，本报告不替代其覆盖。

结论：Spec 轴发现 2 项可达 P2 行为缺陷；修复后需独立复核对应差异及上述两条实际语义。
