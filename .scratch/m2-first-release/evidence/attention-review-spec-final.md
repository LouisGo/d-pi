# M2 多 Thread 提醒：最后两项 delta 的独立 Spec 复核

- 固定 head：`e651e34f2ce21ef49e50fe57322ac10532521436`
- 前次复核 head：`61f1e24efacaf8e5eda4189b84149a2da15eddae`
- worktree：`/Users/louistation/.codex/worktrees/m2-attention-review-spec/d-pi`；开始/结束工作区干净，SHA 未变化。
- 命令：`git status --short`、`git rev-parse HEAD`、`git diff 61f1e24...HEAD`（实际本轮检查使用两端完整 SHA 的 `..` 差异），并静态阅读 Reader sanitize、Main notification 故障输出、ThreadAttention 通用文案短 ID 及回归测试。

## 结论

新增可达高价值 Spec 缺陷 **0**。本轮只复核 requested production/tooling delta 及新增测试，不重复前次全量审查。

1. `src/platform/main/diagnostics/reader.ts` 仅在既有明确白名单增加 `notification-unavailable`。该字符串已由 `src/app/main/lifecycle/application.ts` 的 `attention:notification` failed 输出，不携带原生 error message、路径、正文或秘密。未知字符串继续经 sanitize 转为 unknown，有界扫描及白名单字段未改变，因此既恢复类型化故障原因又保持导出脱敏边界。`reader.test.ts` 新测试经实际文件读取及 scoped filter 检查完整记录与 redacted=0，可发现原先原因丢失；留存 red 日志明确原值被替换为 unknown，green 日志记录 12 Reader tests 通过。此为主 Agent 留存证据，本 reviewer 未本地重跑。

2. `validation/m2/attention.mjs` 的 expectedShortId 改为 `nativeThread.slice(0, 6)`，与 `ThreadAttention` 实际传给 Main 通用通知文案的 `threadId.slice(0, 6)` 一致。它仅修正真实 native observation checkpoint 的预期，不制造显示/click callback、不放宽 observed/unknown/unavailable 的证据区分，也没有把 isSupported 当授权或送达。

本 reviewer 没有 install/build、复制 App、改源/管理状态或 commit。实际 macOS 通知显示/点击与候选 hash/ZIP 同源未由本 reviewer验证；Mac 锁定导致的剩余 native 验证受阻应在交接中单列，不能当产品通过或用户认可。前次 Spec 两项修复结论仍适用于此 head，用户认可/M2 父范围不因本轮静态复核完成。
