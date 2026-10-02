# M2 队列与子 Agent 独立审查

2026-10-02。用户明确要求启动独立 subagent review，发现高价值问题则修复；没有问题才提供下一阶段提示词。本轮审查基线 `a338162..f741765`，两名未参与原实现的只读 reviewer 分别覆盖原生 SDK/Host 所有权与 Main/Renderer/SQLite/GUI 边界。已有环境对齐改动不纳入范围。

## 确认问题与修复

1. **P2：编码超限输入静默失败。** 90000 个中文字符低于 textarea 的旧字符上限，但 JSON UTF-8 编码超过 256 KiB。RuntimeModel 在 try 之外 parse 导致 Promise rejection，无可见失败；GUI 仍允许保存。现在 RuntimeModel 在派发前 safeParse 并给出类型化失败，GUI 使用同一 QueueTextSchema，完整保留超限中文/emoji/转义文本、提示尚未保存、禁用保存，缩短后恢复原生同步。超限部分只在当前输入内，尚未保存；不冒称关窗持久化。
2. **P2：长原文进入编辑后被快照预算锁死。** 250000 ASCII 字符原文可进入编辑；原生快照预留完整编辑稿后将原文显示截为 2048 字符并标不可编辑，Main 却再次用此显示资格阻止 update/save。现在 begin-edit 仍校验原文资格，update/save 校验当前原生编辑身份；不以显示截断阻止已准入的编辑。原冻结提交不回写，保存记录仍诚实标注 previousTruncated，非当前编辑目标仍拒绝。

没有确认子 Agent 默认设置或原生消费所有权的 P1/P2。人工构造的迟到 inspect ACK 竞争不符合实际 Bun FIFO 接收顺序，不作为缺陷。固定 SDK 18.4.6 冷恢复全周期单写证据仍不足，旧 Thread 继续只读。

## 验证与交付

- 真正红灯：Renderer 超限用例产生 ZodError；GUI 三种编码超限用例仍允许保存；Main 长原文用例拒绝已进入编辑的操作。随后最小修复转绿，未以工具入口错误冒充行为红灯。
- 两名 reviewer 原范围独立审查完成；边界 reviewer 修复后重跑 **45 项**相关测试，并复验最初触发实验，未发现残留 P1/P2。原生 reviewer 重跑 9 项子 Agent、7 项工具队列及真实 localhost SDK 队列场景通过；无个人凭据或付费请求。
- 新增 11 项行为回归覆盖编码预算、输入保留/缩短恢复、快照截断后的编辑及非当前目标拒绝；实际包内 harness 追加同一 250000 字符原文和 90000 中文超限的组合回归。完整 `pnpm check` 通过：602 项行为、34 项架构、59 项工具测试，1 项既有 opt-in 跳过；全部类型、设计/i18n、文档/结构/状态门禁通过。[完整检查](evidence/queue-review-check.txt)、[Renderer 红灯](evidence/queue-review-renderer-red.txt)、[GUI 红灯](evidence/queue-review-gui-red.txt)。工作区检查沿用已有环境对齐改动，这些工具文件仍未提交；不据此冒称原始工具环境已通过。候选身份在交付后追加。

本轮沿用 M2 本地 commit、隔离 macOS 包内验证和候选交付授权，不 push。用户认可 pending；附件引用准备和完整队列剩余能力仍在 04/父05，发现两项问题后本轮优先完成修复交付。

## 修复候选与试用

- 干净源码 `2e78dbec272743a9d331aa5be26bc0c546d15301`；版本/构建 `0.1.0-m2.12 / 2e78dbec-b68b57ab`，dirty=false。从独立 clean checkout 构建，未携带已有环境对齐未提交改动。
- App：`dist/queue-review-m2.12-clean/mac-arm64/d-pi.app`。
- ZIP：`dist/candidates/d-pi-0.1.0-m2.12-2e78dbe-mac-arm64.zip`；CRC通过、包内app.asar与实际验证App同源，430050430字节。精确 [SHA-256与身份](evidence/queue-review-candidate.json)。
- [实际包内结果](evidence/queue-review-package-result.json) **17项通过**，包括完整原文250000字符进入编辑、90000中文编码超限完整保留/禁用保存、缩短后原生更新/保存/删除，SQLite冻结原文仍完整。缩短编辑稿释放快照预算后，原文恢复完整显示，保存记录previousTruncated=false；Main集成回归另验证保存时仍截断的previousTruncated=true分支。
- 保留原有双Thread执行/模型/草稿隔离、阅读和DOM连续性、选择/Undo、Router、代表性Chromium composition、刷新无重发及冷旧Thread只读。仅2次localhost模型请求；无个人凭据或费用。日志中的既有失效历史来源拒绝及导航旧frame警告保留，不宣称零错误。真实系统IME全矩阵、红色关窗和完整附件/性能验收未覆盖，用户认可pending。
- 首轮实际功能检查通过，但截图未将编辑警告滚入可见区域；仅修正harness截图滚动，再运行同一App确认17项与实际可见警告/按钮，未改产品或重新构建。[超限状态](evidence/queue-review-m2-queue-oversized.png)、[缩短后可保存](evidence/queue-review-m2-queue-edit.png)、[构建](evidence/queue-review-build.txt)、[打包](evidence/queue-review-pack.txt)、[包内日志](evidence/queue-review-packaged.txt)。

用户复试：保持当前执行，给另一条纯文本排队内容进入编辑；长原文可缩短并保存。输入超限中文/emoji时，应完整保留输入、显示未保存原因并禁用保存；缩短后可保存，也可明确取消编辑。编辑不会改变冻结提交历史或额外触发供应商请求。本候选替代m2.11，历史候选与证据不删除。
