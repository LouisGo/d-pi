## Summary

实时消息、历史和子Agent长正文原先全量进入Markdown/DOM，巨型输出扩大阅读布局。本段加入显式有界原文分段：每段最多8192 UTF-16 units或120行，仅挂载当前段；键盘翻段、完整已取得原文复制、流式追加时已封闭段选择和滚动保留。Thread/Host/历史来源和记录身份隔离，短正文沿用原表示。

实际clean包还暴露Copy被Main blanket权限拒绝的问题；只允许当前WebContents/主框架/当前文档的clipboard-sanitized-write，check/request双入口一致。OMP执行/历史及Host预算、unknown不重发、冷旧Thread只读保持。所属[spec](spec.md#2026-10-06-长输出分段阅读切片)、[06c](issues/06c-bounded-long-reading.md)/[06d](issues/06d-long-reading-candidate.md)。

## Evidence

- 本段base/merge-base `df41925401d6f64cfe4ea73432ca00523f7a5a94`，产品source `c531558406e3c3b7da4544be8df55fe92d40530f`，验证harness `3fdb25f`。累计分支`codex/m2-lifecycle`此前生命周期/引用切片另有固定review，未冒称本次重审整个累计分支。
- TDD新增11条阅读及1条Main权限行为；完整`pnpm check`通过723行为/34架构/70tooling，六类型、lint/设计/i18n/架构/文档/结构/状态通过，两项既有opt-in跳过。[红→绿](evidence/long-reading-tdd.md)、[检查](evidence/long-reading-engineering-check.txt)、[独立双轴review及修复复核](long-reading-review.md)。
- clean `0.1.0-m2.16 / c5315584-f375cd21`实际macOS包21项通过，包含40784 units七段精确复制/剪贴板restored、稳定选择/段内滚动、键盘翻段、原生历史、双Thread和原生子Agent、切换/reload/冷只读。固定SDK真实10MiB artifact经原生middle truncation得到41077 UTF-8 bytes，GUI六段重构且缺口可见，未声称Host收到10MiB。仅隔离localhost，无个人凭据/费用。
- ZIP CRC和app.asar同源通过，最终三图实际视觉检查。[候选身份/哈希/试用/限制](long-reading.md)、[机器结果](evidence/long-reading-package-result.json)。本文件为本地body，没有push或远端PR，其他交互策略worktree未混入。

## Merge Danger

Door：本段阅读/窗口写权限为可回退代码，未增schema/config迁移；累计分支此前schema10和私有文件回收含one-way效果，遵循[生命周期回退说明](lifecycle.md)。

Blast radius：Renderer实时/历史/子Agent正文及页码/选择，Main当前文档clipboard写权限。短→长表示切换和当前增长末段不属于已封闭段DOM稳定承诺；复制仅含已取得原文，原生截断不会补全。harness以有界多格式快照和changeCount保护剪贴板，NSPasteboard无CAS的最终核对→写入窄窗口不承诺绝对原子。

Rollback：回退本段代码及相应窄写权限，不能降累计schema或恢复此前已回收文件。候选未签名/公证，仅本地macOS arm64；真实供应商、系统IME、完整M2负载/故障、PDF视觉/OCR和用户认可pending，merge/工程通过不替代接受。
