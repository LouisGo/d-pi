# 04a 附件与发送时文件引用

Status: resolved
Blocked by: none

M2，沿用 D-10/D-24/D-33 与基础契约 B4/B5。本轮用户明确授权附件引用准备、队列剩余能力、并行开发、隔离 macOS 验证、独立 review、本地 commit；不 push。

交付用户流程：文件选择/粘贴/拖入 → 私有复制及真实准备状态 → 预览、排序、移除/重试 → @ 项目文件发送时读取 → 冻结内容与当前模型/传输预检 → 持久 prepared/dispatching → 原生 ACK 后只消费对应草稿。失败完整保留，不静默丢图、截断或只发文件名；排队后不随磁盘变化。

Main input 拥有私有内容及引用，Tiptap 只存短引用；execution 拥有冻结提交和原生关联。内容准备/GUI/原生队列分别由三个 agent 实施，主 Agent 统一 IPC/提交接口与验收。旧 Thread 继续只读，unknown 不自动重发，PDF 覆盖缺口诚实显示。验收包含内容丢失、迟到/换 Thread、混合内容编码预算、消费竞争和恢复。

## Comments

2026-10-02：开始实施；无新增产品待决，已有冷恢复和退出放弃待决不阻塞本票。

2026-10-02：实现与工作包组合检查完成，源码/正式GUI/原生SDK/macOS及独立review见[本轮记录](../content-preparation.md)。最终clean候选验收完成后登记交付，不改变父票或用户认可pending。

2026-10-02：本票工程交付完成：clean `0.1.0-m2.13 / 7f5d5909-ac115847`，源码 `7f5d590`，654行为/34架构/65工具、18项真实包内检查、独立review修复复核及ZIP同源校验通过。明确验收范围与试用见[交接](../content-preparation.md#候选与试用)，父票未全集完成、用户认可pending；本地commit，不push。
