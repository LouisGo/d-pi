# 03 验证、独立 review 与交接

Status: resolved
Blocked by: 01, 02

范围与授权见 [spec](../spec.md)。用项目真实计划及隔离场景验证新工作流；独立 Spec/Standards reviewer 核对完整差异，主 Agent 核实并修复高价值问题，更新记录并分段提交。

验收：必要工具/文档/依赖/看板检查、skill 格式校验、计划行为测试及独立 forward test；本地分支/commit/PR 草稿可交接。没有远端操作不虚报 CI/PR/merge，M2 状态与原产品行为不变。

完成：完整 check/build、修复后19项相关测试和快速门禁通过。两轴固定范围审查发现同一 P2，修复后各自复核通过。隔离 forward 场景完成串行降级、claimed/held/范围外保持、PR/review/retro；补充场景完成同基点两个真实 worker、独占写集、串行合入、最新基点 fan-in。主 Agent 独立重跑原场景9/9与汇合8/8，核对 clean、原票未改及最终 frontier。详见 [交接](../handoff.md) 与 [验证](../validation.md)。
