# 01 M1 组合路径与必要补修

Status: resolved
Blocked by: none

阶段 M1；范围与所有权见 [spec](../spec.md)。核对当前源码、已有证据及 A1–A10/A12 的实际组合接缝，建立可重复隔离样本。真实缺陷逐行为先失败测试再最小修复；已有正确行为补测不伪造红灯。不改变 S3 退出策略、冷恢复单写门槛或 OMP 所有权。

验收：选区→冻结提交→ACK/新草稿→阅读/原生工具证据，交互→停止/继续→窗口重连，故障→unknown/只读冷恢复可关联且反馈准确；证据清楚区分 fixture、真实 SDK 和供应商。

## Comments

2026-09-30：确认并修复两项当前展示缺陷。普通提交 7 类拒绝原因先 [7 项目标失败](../evidence/rejection-red.txt)，再 [35 项定向通过](../evidence/rejection-green.txt)；同字节来源变化先 [文件/Diff 两项失败](../evidence/selection-source-red.txt)，再 [22 项通过](../evidence/selection-source-green.txt)。没有更改冻结正文、收据事实或执行合同。已有跨真实对象的 [64 项回归](../evidence/combination-regression.txt)、[完整 check](../evidence/check.txt)（399 通过、1 CLI opt-in 跳过）通过；[冻结独立审阅](../evidence/frozen-review.md)未发现可行动缺陷。组合 harness 与当前包观测随后由 02 交付。

`validation/s3/package.mjs --s5` 已补隔离包组合场景与检查点，语法/Biome/diff 检查通过；`validation/s5/trial.mjs` 提供从选择项目开始的人工隔离试用入口。01 的矩阵、补修及自动回归工程完成；实际候选/视觉及最终故障组合验收由 02 负责，不以脚本静态检查冒称已运行。
