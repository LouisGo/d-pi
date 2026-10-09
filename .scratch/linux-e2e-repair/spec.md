# Linux E2E 反馈修复

## 推进与交接

2026-10-09 用户提供 2026-10-08 Linux 原生 GUI 报告与证据 ZIP，明确要求“先复核，随后优雅修复”。受测版本和本地基点均为 `c14297c382fbf436d201605e0c0c9d04a4e0b637`；原工作树干净。本地分支 `codex/linux-e2e-repair`，主 Agent 串行实施；不含远端交付或真实供应商请求。

范围：D01 共享 Portal 层叠、D02 模型 rail 布局、B01 固定 Linux x64 SDK 资源、U01 配置读取失败恢复、U02 从未初始化 Renderer 的关闭与提示合并。沿用 D-02/D-03/D-21/D-22/D-32/D-35/D-37 及现有业务所有权；不改 OMP 源码、凭据、提交/队列恢复、数据库或 SDK 预算。

复核：证据索引中 61 个文件的 bytes/SHA-256 均一致，关键截图/日志与报告相符。菜单反例已在本机 Electron 44.4.5 的真实 Chromium 组件复现；Base UI 嵌套 Portal 被全局 isolation 规则困在 auto 层级，而 Dialog 在同一外 Portal 的 50 层。SDK 日志明确为 811,364,969 bytes 超过 681,574,400；固定 loader 会从 modern 回退 baseline。B02 仅证实 Killed/exit 137，不判定 OOM，不改构建参数迁就未知环境限制。

交付：可审查源码、确定性回归、Electron 组件几何/输入回归、Linux 复试步骤。工程验证和用户复试分开；本机 macOS 的组件回归不是 Linux 原生验收。Linux 实际 SDK import/配置/图片/Host 和报告 BLOCKED 矩阵仍需原 Linux 机器复试。

重要待决：无。本次适配仅固定 Linux x64 分发规则，保留通用 baseline、未知文件、许可、运行闭包、hash、预算与实际 SDK import 门禁；暂不使用 modern 的优化实现。其余平台沿用现状，不承诺完整 Linux 产品支持。构建 137 的具体终止来源仍未知。

2026-10-09 工程收尾：01–03 完成，类型/构建、相关行为/集成与 tooling、隔离 Chromium 回归通过；独立两轴评审的 1 项测试回归已修复，无未解决发现。已交付 [复核与 Linux 复试步骤](handoff.md)，[验证](validation.md)、[评审](review.md)与[PR 描述](pr.md)可审查。Linux SDK import/原生 GUI 和用户认可待反馈。

2026-10-09 远端交付授权：用户随后要求“本地 commit 并 pr 到 main”，包含本切片分支的 commit、push 与创建指向 `main` 的 PR。最终提交及远端 CI 以 Git/PR 的真实 head 和运行记录为准；CI 未完成前保留 Draft。

2026-10-09 后续本地合入授权：Provider/Models 界面反馈迭代后，用户要求“本地 pr 到 main”“全部一起”，将本切片 `077ce1f` 与界面提交 `3fd82b4` 一并合入本地 main。本次不 push、不新增远端 PR、不重跑验证；合并描述见 [本地 PR](../providers-models/ui-pr.md)。原 Linux 机器复试与用户认可仍待反馈。

```implementation-plan
[{"id":"linux-e2e-repair","tickets":["01","02","03"]}]
```

```project-status
[{"id":"linux-e2e-repair","title":"Linux E2E 反馈修复","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","build":"base c14297c3 / codex/linux-e2e-repair","evidence":["handoff.md","validation.md","review.md"],"next":"原 Linux 机器复试 SDK import 和原生 GUI；137 的终止来源仍未知，用户认可待反馈。"}]
```

## 任务

- [01 SDK 资源](issues/01-sdk.md)
- [02 界面与读取恢复](issues/02-ui.md)
- [03 关闭保护](issues/03-close.md)
