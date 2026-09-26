---
name: d-pi-headless-features
description: "用于 d-pi 功能规划与拆票、功能模块或 React 接入实现，以及相关架构评审；落实按功能验证、无头逻辑与正式 GUI 的交付顺序。不用于全局文档/skill 审计、纯文字或纯样式修正。"
---

# d-pi 无头功能交付

按当前任务授权完成所需工作；调查或文档不扩大为实现，完整功能实现也无需逐层重复确认。遵守 D-28–D-30：功能逻辑独立于 React 挂载，每个功能先验证、再无头逻辑、最后正式 GUI，不引入 XState。

## 按任务查合同

以下路径相对本 skill 目录，不相对调用时的 cwd。沿用当前上下文中已读且未变化的内容，只补与本次场景有关的部分。

| 需要确定的内容 | 唯一详细入口 |
| --- | --- |
| 决定状态、用户范围与交付阶段 | [决定登记](../../../docs/decisions.md)、[基础方案](../../../.scratch/product-requirements/foundation-plan.md)及当前功能 spec；提议不能覆盖已确认决定或沿用基线 |
| 功能职责、拥有者、生命周期、React 接入与分层验收 | [无头功能合同](../../../docs/architecture/headless-features.md) |
| 身份/恢复、提交、认证、附件、权限、输出及 G1/M1/M2/M3 | [基础契约](../../../docs/architecture/foundation-contracts.md)相关节；诊断行为再查[诊断合同](../../../docs/architecture/diagnostics.md) |
| 应用 TypeScript 类型、分支与边界实现 | [TypeScript 合同](../../../docs/architecture/typescript.md)相关节；D-35 的 ts-pattern/Zod v4 不改变业务所有权 |
| 拆票、GUI 图标或外部 UI 源码 | 分别查[本地任务约定](../../../docs/agents/issue-tracker.md)、[图标合同](../../../docs/architecture/icon-system.md)，无关任务不加载 |

## 交付判断

围绕当前用户场景明确操作与结果、状态/资源拥有者和释放条件，在现有任务说明中记录即可。优先验证会改变该切片路线的未知；已有适用证据直接复用，最小 IME/焦点/滚动实验可前置，不先建设整套页面或全产品框架。

实现和评审都按场景检查合同：视图订阅/卸载是否误启动或停止后台工作，Thread 切换与迟到结果是否串状态，提交与恢复是否符合原生接受证据。视图只读取投影并发出意图，不搬走 Main/Host/OMP 的既有职责。仅对当前范围有影响的风险安排验证或报告问题。

交付说明受影响决定、实际行为与验证、尚未覆盖的路径。无头通过不等于真实 GUI 验收；设计确定不等于接口或性能已测。需要改变已定方向时按仓库规则处理，普通实现细节自主完成。
