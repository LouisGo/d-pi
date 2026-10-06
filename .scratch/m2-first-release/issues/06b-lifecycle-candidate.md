# 06b 生命周期切片集成与候选

Status: resolved
Blocked by: 04b, 05d

M2，范围仅 [04b](04b-attachment-lifecycle.md)/[05d](05d-subagent-observation.md)，授权与边界见[spec](../spec.md#2026-10-06-生命周期切片)。主 Agent 单写集成、票状态、看板、公共模块清单及候选版本。

串行核实/合入两个 worker 的固定起点提交，检验跨票身份、资源释放及恢复顺序。完成受影响及完整工程检查；固定集成范围的独立 Spec/Standards review、核实修复和复核；必要固定 SDK 与实际 macOS 包内/GUI 验证。交付可识别本地候选、原始证据、限制、试用步骤与本地 PR body，不 push/创建远端 PR，不把工程通过当 M2 全集或用户认可。

## 集成归属

04b/05d 工程验收后由根 Agent 在 `codex/m2-lifecycle` 继续。基点 `c8dbdba`；06b 不再派实现 worker。完整验证、固定双轴 review、候选/交接和管理状态由根单写。

## 验收与交付

2026-10-06：两个worker固定起点实现已串行集成；根核实修复四类高价值问题，两轴review最终固定产品c5e424d复核通过。691行为/34架构/70工具、build/SDK112依赖单元、22项实际clean macOS包内检查、ZIP CRC/app.asar同源核对通过。clean m2.14 / c5e424da-f02704bc、本地PR body、精确证据/限制/试用步骤已交付，见[交接](../lifecycle.md)、[评审](../lifecycle-review.md)、[body](../pr.md)。

本地commit，无push/远端PR；父04/05/06保持未完成范围，M2工程in-progress / 试用delivered / 认可pending。PDF视觉/OCR、真实供应商与签名公证未纳入本段；unknown不重发，冷旧Thread只读。
