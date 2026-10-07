# 本地 PR：集成终端 B 方案与文档基线

日期：2026-10-07。来源分支 `codex/terminal-design`，目标 `main`。用户授权无阻塞问题则本地合入；不创建远端 PR、不 push。设计提交 `72a7deb5c934998f3143cc4749cf3f78ae8e0c81`，base/merge-base `598323321c8c2ba6eb177097e2042510c3b79d87`；最终来源 head 与合并结果由 Git 合并记录核实。

## Summary

此前终端模块仍把 PTY 归 Main、xterm.js/node-pty 保持未选择候选。现在按已确认 D-40 明确 Main 准入与监督、专用 TerminalHost 管 PTY、主页面 Renderer 用 xterm.js；补齐协议、资源/清理、信任、GUI/native接入合同与验收门槛，并同步直接相关入口、ADR、任务依赖和看板。

范围见[spec](spec.md)、[交接](handoff.md)、[终端契约](../../docs/architecture/terminal.md)与[验证设计](../../docs/validation/terminal.md)。当前仅文档，终端功能仍 planned、未交付试用、认可 pending。xterm 路线已确认，T-P1/T-P2仍待产品答复，开发未授权。

## Evidence

- 文档设计提交39文件，未改源码、package/lock、构建配置或模块机器清单。固定官方源码的核实记录见[来源清单](evidence/source-manifest.json)，只证明参考架构事实。
- 两个只读独立 reviewer 对固定 base/merge-base → `72a7deb` 的全部39文件分别覆盖 Spec 与 Standards，均0个阻塞发现；Standards reviewer另复核本次spec授权与生成看板的两文件补充。主Agent核实当前授权补充和本地PR记录。
- `pnpm check:fast` 在授权/看板补充后通过：环境、Biome、交互规则、文档引用、架构、结构快照与状态聚合。初次设计检查原始记录见[快速检查](evidence/fast-check.txt)；本次收尾新记录另经文档/状态与Git差异检查。
- 只做文档变更，不伪造TDD红灯；未跑终端功能、native包、真实GUI或性能验收。没有远端CI或远端PR结果。

## Merge Danger

这是可通过Git revert回滚的文档变更，不修改数据库、权限、运行资源或现有行为。影响范围为后续终端实施依据和相关导航；主要风险是将设计预算或参考源码误读为已实现/已验收，spec和验证文档已明确区分。

合并不授权终端开发、不改变M2试用/认可、不扩大D-39。若回滚，整体回滚此文档范围并重生成状态，避免只撤部分合同留下入口不一致。无数据迁移或需恢复的外部副作用。
