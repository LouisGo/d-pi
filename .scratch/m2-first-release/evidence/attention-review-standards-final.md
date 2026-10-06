# 多 Thread 提醒 Standards 最终增量复核

- 固定 head：`e651e34f2ce21ef49e50fe57322ac10532521436`。
- 本次只读差异：`61f1e24efacaf8e5eda4189b84149a2da15eddae...e651e34f2ce21ef49e50fe57322ac10532521436`；原整体 Standards 结论延续前两份报告，不重新外推验收范围。
- 目录：`/Users/louistation/.codex/worktrees/m2-attention-review-standards/d-pi`；复核前后 HEAD 一致、工作树干净。

## 结论

没有新增高价值 Standards 发现。

`reader.ts` 仅将 Main 现有 `attention:notification` 操作实际产生的精确自有码 `notification-unavailable` 加入 codes Set。该码由 `application.ts` 的 onFailure 固定写入，不来自原生错误全文。`knownCode` 的精确成员匹配、未知码降为 unknown、字段白名单、UUID/构建元数据检查及内容剔除保持。没有扩大为任意前缀/任意 code-like 字符串，也没有引入路径、URL、业务正文、凭据或原生错误内容。

新增 Reader 回归使用真实临时 JSONL 与受限 `readDiagnosticSnapshot`，按 trace/operation 过滤后核对精确自有码保留且 redacted=0；既有未知 code、path/URL、Bearer、业务全文和 token 剔除反例继续保留。已读取提交内真实红灯及 12 tests green 记录，测试针对原有 Reader 把此码改写为 unknown 的可见缺口，不是复述白名单常量。未在本 reviewer 环境重跑这组测试。

`attention.mjs` 的 expectedShortId 改为六位，与 Main 生产 `threadId.slice(0, 6)` 一致；只改人工核验 checkpoint 的预期值，没有改变系统通知内容、身份 DTO、事件关联、来源授权、seen active Thread 校验、Main 权限或任何执行操作。

本次改动保持诊断仅观察/读取、失败不改变业务结果、默认不记录秘密/全文的合同。通知失败码保留只能表达 App 在原生通知边界观测到失败，不证明 OS 权限、通知显示或点击送达；源码中的 supported/available 提示及实机观察的证据边界仍有效。

## 实际证据与未覆盖

本 reviewer 完成源码、调用链、测试和提交内红绿记录的静态增量复核；只写本报告，未 install/build、改源、复制候选或操作 OS 通知。主 Agent 所报实际包 16 项自动检查和 native macOS timeout 不由本次静态复核独立确认；timeout 不能当作通知显示/点击成功。最终产品提交、包内 metadata、app.asar/ZIP 同源、完整门禁与实机限制仍以主 Agent 的实际验证记录交付，用户认可保持独立。
