# 05c 原生队列附件内容编辑

Status: resolved
Blocked by: none

所属范围见 [spec](../spec.md)，父票 [05](05-queue-subagent.md)。M2，保持 OMP 原生队列唯一拥有者；编辑已排队文本时保留图片，显式移除指定图片；删除/排序不丢伴随信息，消费与编辑竞争保持真实身份与批次暂缓。

有界投影只传元信息，不复制二进制或队列事实；旧提交原件保持不可变，Main 记录编辑前来源与变更；unknown 不自动重放。custom/未支持内容明确只读。GUI 覆盖内容表示、焦点、失败与恢复；实际 localhost SDK 样本和隔离 macOS 候选分别记录。

## Comments

2026-10-02：用户明确授权本阶段开发与验收；本票不宣称完整子 Agent 生命周期或 M2 用户认可。

2026-10-02：实现与工作包组合检查完成，源码/正式GUI/原生SDK/macOS及独立review见[本轮记录](../content-preparation.md)。最终clean候选验收完成后登记交付，不改变父票或用户认可pending。

2026-10-02：本票工程交付完成：clean `0.1.0-m2.13 / 7f5d5909-ac115847`，源码 `7f5d590`，654行为/34架构/65工具、18项真实包内检查、独立review修复复核及ZIP同源校验通过。明确验收范围与试用见[交接](../content-preparation.md#候选与试用)，父票未全集完成、用户认可pending；本地commit，不push。
