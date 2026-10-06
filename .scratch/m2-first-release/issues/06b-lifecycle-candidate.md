# 06b 生命周期切片集成与候选

Status: open
Blocked by: 04b, 05d

M2，范围仅 [04b](04b-attachment-lifecycle.md)/[05d](05d-subagent-observation.md)，授权与边界见[spec](../spec.md#2026-10-06-生命周期切片)。主 Agent 单写集成、票状态、看板、公共模块清单及候选版本。

串行核实/合入两个 worker 的固定起点提交，检验跨票身份、资源释放及恢复顺序。完成受影响及完整工程检查；固定集成范围的独立 Spec/Standards review、核实修复和复核；必要固定 SDK 与实际 macOS 包内/GUI 验证。交付可识别本地候选、原始证据、限制、试用步骤与本地 PR body，不 push/创建远端 PR，不把工程通过当 M2 全集或用户认可。
