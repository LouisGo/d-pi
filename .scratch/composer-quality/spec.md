# Composer M1/M2 编辑质量与异步导入

2026-10-08。用户明确授权依据《DPI Composer 深度研究与开发方案》实施 M1、独立推进 M2，并以截图为 Composer UI 参考；授权包含代码、必要测试及 pnpm dev 原生交互验收，不包含远端发布。

## 推进与交接

- 基点：`a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`；新建隔离集成工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`，分支 `codex/composer-quality`，基于原工作树最新 HEAD/现状；原工作树 `/Users/lou/Learn/d-pi` 已恢复干净，原会话证据和提交保留。本轮 WIP 已逐文件 SHA-256 校验迁移；纠正先在原目录开始的流程错误，迁移备份 `/var/folders/y8/gw467hcx2ll1z8qkddqydq7c0000gn/T/dpi-composer-migration-s_xw04pw`。
- 基线：已复核 T3 foundations 和最新 input 源码。保留 Draft v1、EditorState/Undo cache、Main history leases、可信 clipboard、FrozenSubmission 与 native queue；D-10/D-21/D-22/D-33/D-35/D-37 继续有效。
- 产品判断：无重大待决。M1 为 cursor-anchored @、query/activeId/Escape、expectedSource/owner、单次确认、IME/popup/send 键盘优先级、原子引用详情和合法焦点恢复、准备/失败/待插入反馈。截图用于布局与层级，视觉值仍来自现有 token。
- M2：文本即时插入；文件按 batch 原始顺序一次独立 Undo 插入映射原位置，left affinity；删除/Undo/消费/外部替换/解绑使自动目标失效，保留原 Thread 待插入；部分失败须显式接受子集。排队/读取取消与 Main 接受后结算分别表达，预算在 await 前预留。
- 工程：实施中；实际验证及未完成项随交接更新。试用与用户认可待完成；工程通过不代表用户认可。
- 派发：02 `composer_imports` → `/Users/lou/Learn/d-pi-composer-imports` → `codex/composer-imports` → 同一基点 `a9cf9a9`；主 Agent 01 在上述隔离集成工作树单写。
- 执行：主 Agent 单写规格/任务/生成看板/集成；M2 worker 单写隔离 worktree 的 input imports/lifecycle/batch adapter 与 Thread 装配，不写 M1 控件/Composer/CSS/locale；共享 public 导出串行集成。

```project-status
[{"id":"composer-quality","title":"Composer M1/M2 编辑体验","phase":"M2","engineering":"in-progress","trial":"not-delivered","acceptance":"pending","evidence":["spec.md"],"next":"完成 M1 与独立 M2、定向测试和 Dev 原生交互验收"}]
```

```implementation-plan
[{"id":"composer","tickets":["01","02","03"]}]
```

## 验收

01：加载/空/失败 popup Enter 不发送，IME 229/isComposing/view.composing 不确认引用或发送；同长度旧结果拒绝；Escape 同 token 持续关闭；稳定 active option 与 editor 焦点；原子 chip 详情/删除/焦点恢复，截图布局适配窄窗/light/dark。
02：真实 PM mapped target、B 保留、批次一次 Undo；partial failure 不自动接受；逐阶段取消与 retry/old finally、budget/freeze/dispose/late completion 跨 Thread 隔离；Main 资源结算沿既有 pin/lifecycle 或最小严格补充合同，不能借用 clipboard discard。
03：组合类型/格式/架构/行为/build、独立 Spec/Standards review；pnpm dev 实际键盘、粘贴、焦点、Thread 切换与图片；记录真实 IME/VoiceOver/30min 性能未验证项，不伪报通过。
