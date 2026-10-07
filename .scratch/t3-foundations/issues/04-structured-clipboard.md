# 04 可信结构化剪贴板

Status: resolved
Blocked by: none

阶段：基建，改善既有 M2 路径。范围、授权、唯一拥有者、跨边界合同、完整验收与未覆盖层级以 [spec](../spec.md) 中目标 04 为准；证据与取舍见 [独立研究](../research.md)。

本票的 resolved 表示声明的工程目标和验证完成，不替代整段用户认可。实施按固定基点独立 worktree、逐行为 TDD、必要真实接缝验证；不修改其他票、共享状态或集成分支。

## Comments

- 2026-10-07：已建立文档与契约，尚未声明实现通过。

- 2026-10-07：03已集成，独立图片/冻结选区/可信handle部分开始实施；动态引用语义依照spec待决，仅暂停依赖部分。

- 2026-10-07：独立图片/冻结选区/可信handle、正常额度回收、失败与迟到清理、一次Undo/Redo均已实施并通过两轴独立复核、完整check/build及真实macOS复制链路；证据见[04](../evidence/04-clipboard.md)、[恢复](../evidence/04-clipboard-recovery.md)和[07](../evidence/07-integration.md)。仅动态@文件/目录版本与权限选择未收到，依赖部分保持hold，本票不提前resolved。

- 2026-10-07：用户回复选项1，复制时冻结来源与版本，hold已解除；主Agent先补spec/决定/合同，再按固定基点实施剩余动态引用范围。原动态引用仍发送时读取；未以选择本身声明工程完成。

- 2026-10-07最终：用户选项1完整实施并集成，固定生产源b49c413；完整check/build、1010tests/174files和真实Main/preload/Chromium/macOS跨项目冻结复制/来源详情/UndoRedo通过，两轴最终复核无未处理高价值发现。目录名.pdf的freeze与preview反例已闭环，资源/失败恢复旧反例保留。证据见[07](../evidence/07-integration.md)与[04冻结](../evidence/04-frozen-references.md)，已按[handoff](../handoff.md)Dev交付；工程resolved不替代用户试用认可。
