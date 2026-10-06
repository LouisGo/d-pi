# 多 Thread 提醒切片 Standards 独立评审

## 固定输入与覆盖

- 审查目录：`/Users/louistation/.codex/worktrees/m2-attention-review-standards/d-pi`。
- base / 实际 merge-base：`7c9e1fee48ccb467db359a18401d8a30ca57a04e`。
- head：`46121f1fcf5574724f2c023c8beda6374366dfee`；审查前后工作树干净，HEAD 未变。
- 差异命令：`git diff 7c9e1fee48ccb467db359a18401d8a30ca57a04e...HEAD`；核对对应九个提交。
- 只读 Standards 轴；授权与场景依据读取 `.scratch/m2-first-release/spec.md` 多 Thread 提醒末段、01a/01b/01c；没有将工程通过或历史候选视为用户认可。
- 读取根及 app/execution/preferences/platform/shared AGENTS；architecture/headless-features/typescript/state-query/design-system/code-review skills 与相关基础契约、导航、模块地图、机器清单、诊断、设计系统合同。GUI 用现有设计上下文与源码核对，不作未经运行的视觉结论。
- 覆盖 Main 提醒归纳及 RuntimeService→SubmissionCoordinator→SQLite→桌面回调链；窗口/Renderer reload/关闭/退出的观察生命周期；原生 Notification 监听释放；trusted IPC/preload shape、trace、source-generation 与 active Thread 检查；Renderer snapshot/instance/revision/实体订阅、路由准入与定位；独立通知偏好/schema 11 迁移和原恢复顺序；共享 i18n/diagnostics；实际 SDK/local-provider/包内 harness 与相关测试。

## 发现 1 — P2 / Standards：终态去重吞掉同一提交的迟到失败纠正

位置：`src/app/main/wiring/thread-attention.ts:257-260`。

触发：当前同一 generation 的最新提交先有 `outcome=completed`（或 `aborted`）收据，随后原生同 request/target 的迟到 error 经 execution 核实、持久化为 `outcome=failed` 并再次发布收据。没有新提交取代它，也没有 pending interaction。

证据：`SubmissionRepository.observePromptResult()` 明确保留 error，`failSubmission()` 允许将已 ACK 的结果改为 failed；`SubmissionCoordinator.receive()` 每次返回当前持久收据，`RuntimeService.receive()` 的 submission 分支每次 `publishSubmission(result)`；`desktop-services.ts` 将每个 receipt 转给 attention。已有 `tests/integration/runtime-causality.integration.test.ts:517` 覆盖 completed→error→重复 completed 后持久失败不被擦除的实际 Host/Runtime 链路。提醒这里却仅凭同 `threadId:generation:submissionId` 的 `receipts.has(key)` 提前返回，存下的 outcome 完全不参与判断。

要求：execution AGENTS 的“重复终态与迟到错误仍核对完整身份”；基础契约 B2 的首次 ACK、精确原生结果、迟到 error 分离；无头功能合同的一项事实一个权威拥有者。提醒必须消费权威收据的纠正，不能用首次终态冻结第二份结果事实。

实际影响：侧栏/App 提醒继续显示已完成或中断，后台失败没有新的 unread/event/native alert；用户从提醒层看不到已确认失败。持久 execution 收据本身正确，因此这不是执行重放或数据丢失。

复现：以 Node `--experimental-transform-types --input-type=module` 直接导入固定 head 的真实 `ThreadAttention`（无需依赖安装、不修改源码），传入同一 receipt 的 completed→failed。输出为 `after completed [ 'completed' ]`、`after failed correction [ 'completed' ]`，native show 仅一次。该样本只验证提醒行为；原生可达性由上述源码/既有集成样本证明，未冒称实机供应商复现。

最小修复：以同身份“同 outcome”去重，接受合法 completed/aborted→failed 纠正，并保持 failure sticky，不让迟到 success 擦除。新增同 submission 的 completed→failed→重复 failed/success 回归，验证 event/unread 和系统失败提醒仅生成一次；连到现有 Runtime receipt 发布样本验证。

## 发现 2 — P2 / Standards：实际包 harness 对非 active Thread 的 seen 期待成功，必定提前失败

位置：`validation/m2/attention.mjs:301-309`，核心错误断言为 307。

触发：实际包提醒 harness 完成原生确认后，301 调用 `selectThread(threadA)` 并等待真实 active_thread=A，再在 305 对不同的 `interactionThread` 发 `seen`；307 断言 `kind=snapshot`，309 读取 `staleReply.snapshot`。

证据：`validation/m2/package.mjs:284` 的 selectThread 经 GUI 点击并等待 SQLite active_thread 等于指定 id；`src/app/main/ipc/attention.ts:80-90` 明确对 seen 校验 known Thread 且 `getActiveThread()===id`，否则返回 `{kind:'failed',code:'invalid-request'}`。该请求的 shape 与 trace 正确，preload 会正常返回 typed failed，不会改写成 snapshot。

要求：可信宿主核对真实 Thread/状态归属，来源或 shape 正确不能替代资源身份检查；spec/01c 要求实际包证据正确区分成功、拒绝和未验证。

实际影响：`--attention` 的实际包流程确定在 stale-event 检查处终止，后续失败定位、正常完成、偏好及原生后台/关窗重开证据无法取得；这个失败来自脚本错误断言，不能作为生产 IPC 缺陷处理。

最小修复：保留 Main active Thread 拒绝，断言返回 failed/invalid-request 与同 trace；另用 snapshot 命令读取，核对未产生 openRequest、未改变原生回答/未新增 provider 请求。若还要覆盖 active Thread 内的过期 eventId，再单列该样本并期待 snapshot 中事实不变。

## 验证与限制

- 本评审未安装依赖、构建、复制 App、改源码/任务状态或提交；仅写本报告。
- 未执行完整 test/type/lint/architecture 门禁，交由主 Agent 在可用环境完成；没有把版本控制内红绿证据当成本次运行结果。
- 已执行真实提醒类的无依赖小型行为复现；harness 问题为确定调用链与返回值静态证明，未实际启动 Electron。
- 系统通知真实显示/点击、OS 权限与签名、主题密度视觉、实际关窗重开及最终 ZIP 同源未由本 reviewer 验证。未将 Notification.isSupported 当作送达证明。
- 未确认其它高价值 Standards 缺陷；没有把暂态导航窗口、风格偏好或启发式 smell 计入发现。
