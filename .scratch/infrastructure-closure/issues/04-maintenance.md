# 04 维护与交付边界

Status: resolved
Blocked by: none

范围与授权见 [spec](../spec.md)。核对固定 SDK、开发 skills 与原生扩展、安全入口及分发现状，已证实缺陷按 TDD。

## 验收

[OMP 维护](../../../docs/engineering/omp-maintenance.md)、[桌面安全](../../../docs/engineering/desktop-security.md)、[本地交付](../../../docs/engineering/local-delivery.md)分别给出固定 SDK 回放/真实行为/升级、现有窗口与 IPC 边界、版本/许可/签名/公证/更新的已有与待决项。开发 skills 与原生资源职责区分；固定 SDK 仍会发现项目 `.agents/skills`，没有声称物理隔离或改变原生发现策略。

两个真实缺陷按 TDD 修复于 `501b09b`：外部开发 URL 可进入特权窗口；notices 生成器截断后续 SDK/Bun 声明。[实施与实际证据](../evidence/maintenance-results.md)包含固定 Node 24.21.0 的 28 项定向回归、Main 类型、声明生成器行为测试、真实 Electron 三种加载模式与独立隔离包资源核对。初轮工具链误报已纠正，不把 Node 22 运行记作固定环境。

SDK 实际行为复用[工程的一轮验证](../evidence/engineering-results.md)，未升级 SDK、重采历史帧或修改个人资源。24 个 SDK 包目录未找到声明文件候选，公开分发前需核对来源义务；不据此推断上游无许可，不阻塞内部 S5 工程。项目许可证由权利人选择；签名、公证、更新尚未实施，公开发布未授权。S3 退出放弃、冷恢复单写门槛未改。工程 resolved 不代表用户认可。禁止 push 和 S5/M2。

2026-09-30 冻结独立审阅补充：真实 HTTPS redirect 证明初始开发 URL 约束可绕过；真实 Markdown 许可证标题证明 notices 续节判断仍会累积重复。两项按 TDD 补修于 `2d671e8`，[重定向记录](../evidence/security-redirect-results.md)和[声明重生](../evidence/license-cleanup.json)保留新红绿；[独立复核](../evidence/engineering-review.md)确认两项关闭。原通过记录只证明其原场景，不覆盖漏测路径。

新独立候选包 `dist/infrastructure-final/mac-arm64/d-pi.app` 的[真实窗口边界](../evidence/window-security-final-package.txt)与[包内 SDK 资源](../evidence/final-package-sdk.json)通过。构建源为 `3285474` dirty 补修、build ID `3285474e-dirty-1f488792`；没有把它写成后续 clean HEAD 或新用户试用验收。
