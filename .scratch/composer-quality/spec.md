# Composer M1/M2 编辑质量与异步导入

2026-10-08。用户明确授权依据《DPI Composer 深度研究与开发方案》实施 M1、独立推进 M2，并以截图为 Composer UI 参考；授权包含代码、必要测试及 pnpm dev 原生交互验收，不包含远端发布。

## 推进与交接

- 基点：`a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`；新建隔离集成工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`，分支 `codex/composer-quality`，基于原工作树最新 HEAD/现状；原工作树 `/Users/lou/Learn/d-pi` 已恢复干净，原会话证据和提交保留。本轮 WIP 已逐文件 SHA-256 校验迁移；纠正先在原目录开始的流程错误，迁移备份 `/var/folders/y8/gw467hcx2ll1z8qkddqydq7c0000gn/T/dpi-composer-migration-s_xw04pw`。
- 基线：已复核 T3 foundations 和最新 input 源码。保留 Draft v1、EditorState/Undo cache、Main history leases、可信 clipboard、FrozenSubmission 与 native queue；D-10/D-21/D-22/D-33/D-35/D-37 继续有效。
- 产品判断：无重大待决。M1 为 cursor-anchored @、query/activeId/Escape、expectedSource/owner、单次确认、IME/popup/send 键盘优先级、原子引用详情和合法焦点恢复、准备/失败/待插入反馈。截图用于布局与层级，视觉值仍来自现有 token。
- M2：文本即时插入；文件按 batch 原始顺序一次独立 Undo 插入映射原位置，left affinity；删除或撤销发起粘贴的原始内容/锚点、消费、外部替换或解绑使自动目标永久失效，保留原 Thread 待插入。无关输入的 Undo、纯标签更新不失效，Redo 不复活旧导入意图；部分失败须显式接受子集。排队/读取取消与 Main 接受后结算分别表达，预算在 await 前预留。2026-10-08 依据原方案第13章补足 Undo 的限定，未改变原产品选择。
- 工程：用户拒绝旧UI后，连续输入表面、项目内联引用、外部附件分区与组合操作栏已重新实现，代码固定于 `3918b64`。M1/M2 风险回归和本轮 Dev 对照已完成；本地可试用，用户认可 pending。完整检查有一项既有 CLI fixture 与 SDK 打包规则冲突，不能称全绿；真实 IME/VoiceOver/缩放/30min 性能未验证。证据、构建身份和限制见 [交接](handoff.md)、[验证](validation.md)与[独立评审](review.md)。
- 派发：02 `composer_imports` → `/Users/lou/Learn/d-pi-composer-imports` → `codex/composer-imports` → 同一基点 `a9cf9a9`；主 Agent 01 在上述隔离集成工作树单写。
- 执行：主 Agent 单写规格/任务/生成看板/集成；M2 worker 单写隔离 worktree 的 input imports/lifecycle/batch adapter 与 Thread 装配，不写 M1 控件/Composer/CSS/locale；共享 public 导出串行集成。

```project-status
[{"id":"composer-quality","title":"Composer M1/M2 编辑体验","phase":"M2","engineering":"complete","trial":"delivered","acceptance":"pending","build":"Dev / codex/composer-quality / 3918b64","evidence":["handoff.md","validation.md","review.md"],"next":"试用重做的Composer；补真实IME、VoiceOver、缩放和长会话验收，收取用户反馈","constraints":"本地源码与 Dev 交付；未推送/发布；既有CLI fixture失败保留，真实provider/Host queue未重跑，用户认可pending。"}]
```

```implementation-plan
[{"id":"composer","tickets":["01","02","04","03"]}]
```

## 验收

01：加载/空/失败 popup Enter 不发送，IME 229/isComposing/view.composing 不确认引用或发送；同长度旧结果拒绝；Escape 同 token 持续关闭；稳定 active option 与 editor 焦点；原子 chip 详情/删除/焦点恢复，截图布局适配窄窗/light/dark。
02：真实 PM mapped target、B 保留、批次一次 Undo；partial failure 不自动接受；逐阶段取消与 retry/old finally、budget/freeze/dispose/late completion 跨 Thread 隔离；Main 资源结算沿既有 pin/lifecycle 或最小严格补充合同，不能借用 clipboard discard。
03：组合类型/格式/架构/行为/build、独立 Spec/Standards review；pnpm dev 实际键盘、粘贴、焦点、Thread 切换与图片；记录真实 IME/VoiceOver/30min 性能未验证项，不伪报通过。

## 2026-10-08 用户拒绝UI交付，重新打开M1

上一版功能验证不构成UI验收。用户明确要求重做布局/组件/样式/交互/文案：项目内@引用及复制的项目上下文仅正文内联，不进入外部附件栏；外部图片/文件分别以缩略图/紧凑文件chip呈现；正文与附件共享连续表面，底部模型/权限/操作栏。附件与存储、附件详情、输入选项三个默认展开入口移走，维护从次级入口按需打开，具体来源的失败/确认仍就近可见。参照 [T3 ChatComposer 固定源码](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/chat/ChatComposer.tsx) 的Surface/Banner/Prompt/Toolbar分工，用d-pi自有Base UI组件和token实现；不复用T3状态/队列/权限架构。原M2、草稿、资源lease、trusted clipboard、immutable send及native queue不变。

当前集成基点72863d9，沿用本任务已隔离主树，原工作树继续保留；toolbar leaf隔离分派，root单写编辑表面/附件绑定/规格/看板。验收为真实Dev对照用户截图，项目引用无重复附件、长文件名/图片/空态/错误/窄窗/light-dark/键盘焦点；不以变量使用或单测绿宣称UI合格。

纠正已交付：独立 Spec/Standards 发现的键盘、映射 bookmark、展开与 picker 焦点问题均修复并关闭；fresh finish review 对浅色宽窗收起/展开/More/实际鼠标焦点给出 ship。root 补充深色、565px停靠内容视口、长文件名及超限→重试取消→成功后立即输入；最后17文件127项通过。这里只关闭工程票，未将 reviewer 结论替代用户认可，也未将普通中文粘贴替代真实输入法组合态。详见交接的未完成矩阵。
