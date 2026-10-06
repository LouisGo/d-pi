# 04c 文件与目录引用评审

2026-10-06。实际 base/merge-base `b290b36ea73f6586f6b9706e014f4c80a0720d33`，最终生产 head `31cb91229852d8c6dfabb6e88fce06e78cbf6030`。本轮差异 `git diff b290b36...31cb912`；上一段 lifecycle 的 `c8dbdba...c5e424d` 评审仍由[lifecycle-review](lifecycle-review.md)维护，不冒称本轮两个 reviewer 重审整个累计分支。

## 独立模式与覆盖

两个新的只读 reviewer 分别覆盖 Spec 与 Standards，使用同一固定 review checkout；实施者结论未作为评审依据。首次 Standards 尝试在提交完整报告前中断，只采用根已真实复现的目录一致性候选；随后新的独立 Standards reviewer 完整审查主体与全部修复。

Spec 初次覆盖全部31文件并通过相关32行为/1 benchmark跳过；随后独立复核目录自身/祖先改名恢复、项目根替换等4行为，以及最终根替换/刷新失败3行为。最终 head31cb912无新增/未解决高价值 Spec 问题。Standards 最终覆盖整个范围，独立读取模块/AGENTS/skills/权限/资源/状态/存储/设计合同，在同head candidate经隔离 wrapper验证 AttachmentService 6/6，通过 diff --check；原P1已解决，无其它未解决高价值 Standards 问题。[独立最终报告](evidence/references-standards-final.md)。Review checkout初末clean，最终head31cb912。

## 已核实和修复

- 索引目录及祖先在 iterator 打开期间改名后恢复，原 inode/path 后置检查不能识别所有混合条目。真实受控 FS 回归先失败，加入 ctime 与发布前全部已采样目录 dev/ino/ctime 复核；变化不缓存、不发布。无逐文件新增 stat。自身/祖先、根替换及关闭回归通过；预算仍有界。[一致性 red](evidence/references-consistency-red.txt)、[green](evidence/references-consistency-green.txt)。
- P2 键盘候选：同 query 刷新失败后 Query 保留 data，错误 UI 隐藏行但 Enter 仍可选择旧结果。真实 React 回归先失败，entries 同时排除 pending/isError；Enter仍消费但不插入或发送。[red](evidence/references-search-error-red.txt)、[green](evidence/references-search-error-green.txt)。Spec/Standards独立复核最终源码。
- P1 发送根授权：通用 files API 允许路径别名，但新目录冻结不能把记录根变化后的外部 realpath 当授权根。真实 AttachmentService 回归原先成功冻结，修复共享 file/directory 读取前后根类型/realpath/dev/ino/ctime，引用与草稿保留。通用浏览别名行为保持。[目录 red](evidence/references-root-red.txt)、[文件 red](evidence/references-file-root-red.txt)、[6/6 green](evidence/references-root-green.txt)。Standards独立复核确认解决。

完整矩阵、性能测量和实际 Electron 候选由根验证，reviewer 未宣称独立重跑或用户认可。精确构建、GUI结果、限制和试用见[本轮交接](project-references.md)。
