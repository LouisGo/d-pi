# Composer M1/M2 编辑质量与异步导入

2026-10-08。用户明确授权依据《DPI Composer 深度研究与开发方案》实施 M1、独立推进 M2，并以截图为 Composer UI 参考；初次授权包含代码、必要测试及 pnpm dev 原生交互验收，不包含远端发布；后续最新反馈明确本轮用户自行实机测试，Agent不启动GUI/E2E。

## 推进与交接

- 基点：`a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`；新建隔离集成工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`，分支 `codex/composer-quality`，基于原工作树最新 HEAD/现状；原工作树 `/Users/lou/Learn/d-pi` 已恢复干净，原会话证据和提交保留。本轮 WIP 已逐文件 SHA-256 校验迁移；纠正先在原目录开始的流程错误，迁移备份 `/var/folders/y8/gw467hcx2ll1z8qkddqydq7c0000gn/T/dpi-composer-migration-s_xw04pw`。
- 基线：已复核 T3 foundations 和最新 input 源码。保留 Draft v1、EditorState/Undo cache、Main history leases、可信 clipboard、FrozenSubmission 与 native queue；D-10/D-21/D-22/D-33/D-35/D-37 继续有效。
- 产品判断：无重大待决。M1 为 cursor-anchored @、query/activeId/Escape、expectedSource/owner、单次确认、IME/popup/send 键盘优先级、原子引用详情和合法焦点恢复、准备/失败/待插入反馈。截图用于布局与层级，视觉值仍来自现有 token。
- M2：文本即时插入；文件按 batch 原始顺序一次独立 Undo 插入映射原位置，left affinity；删除或撤销发起粘贴的原始内容/锚点、消费、外部替换或解绑使自动目标永久失效，保留原 Thread 待插入。无关输入的 Undo、纯标签更新不失效，Redo 不复活旧导入意图；部分失败须显式接受子集。排队/读取取消与 Main 接受后结算分别表达，预算在 await 前预留。2026-10-08 依据原方案第13章补足 Undo 的限定，未改变原产品选择。
- 先前阶段：用户拒绝旧UI后，连续输入表面、项目内联引用、外部附件分区与组合操作栏已重新实现，代码固定于 `3918b64`。M1/M2 风险回归和本轮 Dev 对照已完成；本地可试用，用户认可 pending。完整检查有一项既有 CLI fixture 与 SDK 打包规则冲突，不能称全绿；真实 IME/VoiceOver/缩放/30min 性能未验证。证据、构建身份和限制见 [交接](handoff.md)、[验证](validation.md)与[独立评审](review.md)。
- 派发：02 `composer_imports` → `/Users/lou/Learn/d-pi-composer-imports` → `codex/composer-imports` → 同一基点 `a9cf9a9`；主 Agent 01 在上述隔离集成工作树单写。
- 执行：主 Agent 单写规格/任务/生成看板/集成；M2 worker 单写隔离 worktree 的 input imports/lifecycle/batch adapter 与 Thread 装配，不写 M1 控件/Composer/CSS/locale；共享 public 导出串行集成。

```project-status
[{"id":"composer-quality","title":"Composer M1/M2 编辑体验","phase":"M2","engineering":"complete","trial":"feedback","acceptance":"pending","build":"main merge98fa5db；sourceec09aeb/行为ace6a19；完整check/build通过","evidence":["handoff.md","validation.md","review.md"],"next":"已完整合入本地main；用户复试Finder回返outline、图片/文件与长期性能，实机认可pending","constraints":"仅本地PR/merge，不push；本轮未运行GUI/真实Host/provider；Finder原生事件、IME/VoiceOver、长期性能及用户认可pending。"}]
```

```implementation-plan
[{"id":"composer","tickets":["01","02","04","03","05","06","07","08","09"]}]
```

## 验收

01：加载/空/失败 popup Enter 不发送，IME 229/isComposing/view.composing 不确认引用或发送；同长度旧结果拒绝；Escape 同 token 持续关闭；稳定 active option 与 editor 焦点；原子 chip 详情/删除/焦点恢复，截图布局适配窄窗/light/dark。
02：真实 PM mapped target、B 保留、批次一次 Undo；partial failure 不自动接受；逐阶段取消与 retry/old finally、budget/freeze/dispose/late completion 跨 Thread 隔离；Main 资源结算沿既有 pin/lifecycle 或最小严格补充合同，不能借用 clipboard discard。
03：组合类型/格式/架构/行为/build、独立 Spec/Standards review；pnpm dev 实际键盘、粘贴、焦点、Thread 切换与图片；记录真实 IME/VoiceOver/30min 性能未验证项，不伪报通过。

## 2026-10-08 用户拒绝UI交付，重新打开M1

上一版功能验证不构成UI验收。用户明确要求重做布局/组件/样式/交互/文案：项目内@引用及复制的项目上下文仅正文内联，不进入外部附件栏；外部图片/文件分别以缩略图/紧凑文件chip呈现；正文与附件共享连续表面，底部模型/权限/操作栏。附件与存储、附件详情、输入选项三个默认展开入口移走，维护从次级入口按需打开，具体来源的失败/确认仍就近可见。参照 [T3 ChatComposer 固定源码](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/chat/ChatComposer.tsx) 的Surface/Banner/Prompt/Toolbar分工，用d-pi自有Base UI组件和token实现；不复用T3状态/队列/权限架构。原M2、草稿、资源lease、trusted clipboard、immutable send及native queue不变。

当前集成基点72863d9，沿用本任务已隔离主树，原工作树继续保留；toolbar leaf隔离分派，root单写编辑表面/附件绑定/规格/看板。验收为真实Dev对照用户截图，项目引用无重复附件、长文件名/图片/空态/错误/窄窗/light-dark/键盘焦点；不以变量使用或单测绿宣称UI合格。

纠正已交付：独立 Spec/Standards 发现的键盘、映射 bookmark、展开与 picker 焦点问题均修复并关闭；fresh finish review 对浅色宽窗收起/展开/More/实际鼠标焦点给出 ship。root 补充深色、565px停靠内容视口、长文件名及超限→重试取消→成功后立即输入；最后17文件127项通过。这里只关闭工程票，未将 reviewer 结论替代用户认可，也未将普通中文粘贴替代真实输入法组合态。详见交接的未完成矩阵。

## 2026-10-08 图片/文件语义反馈

最新用户六项要求授权05，取代本规格中“所有外部附件仅rail且隐形PM锚点”的旧展示/历史选择。外部图片在缩略图栏独立管理，不进入编辑文档或Undo/Redo；其余文件在正文可见内联，MIME优先的图标/颜色/大小，参与Undo/Redo；项目@仍为内联上下文。当前Composer重复附件不重复采用，保留源身份与私有内容摘要，不按内容摘要合并数据库来源记录或混淆不同版本。重复大块状态移入对应附件详情，默认只保留就近状态标记和无对应节点的操作失败。T3固定源码的images/files/prompt分工与采用去重可直接参考，草稿/lease/可信clipboard/冻结提交/queue仍由现有d-pi拥有者承担。验收由用户实机执行，Agent只完成自动化与源码交付，不机械重跑E2E。

本次补充工程交付于e0c43e5，05票resolved；图片外置独立历史、其他文件MIME内联、采用去重和详情反馈已完成，并修复真实Main历史移出、冻结source跨保存/准备/扫描/Renderer readiness的一致性。最终50文件369项通过、类型/门禁/build通过，两轴独立评审无剩余发现。按用户要求未做本次GUI/E2E，视觉/真实IME认可仍pending；SDKPDF既有fixture失败和早期CLIfixture失败准确保留。

## 2026-10-08 日常状态与输入表面反馈（06）

用户授权继续在现有 composer-quality 工作树自主修复 Composer：日常保存 pending 安静，不停止保存；普通鼠标聚焦与输入无 outline，修正共享焦点入口；成功导入不长驻占位，移除、清空、Undo/Redo、去重与异步结算不能误报已采用。参照固定 T3 的连续编辑表面、实际附件和按需 Banner，用 d-pi 组件/token 实现紧凑恢复和窄窗工具栏。保留图片独立历史、非图片正文历史、项目 @ 内联、Draft v1/Main lease/trusted clipboard/immutable send/native queue。

06 由 root 单写，基点 2fdeab2，类型/状态与设计 skill 按改动适用；不新建实施工作树，不修改原 checkout。本轮不运行 Dev/GUI/Computer use/E2E/provider/Host 发送，实机用户自行验收；只本地交付，不 push/远端 PR/发布。无重大产品待决。

06 工程交付于 6b39d19：日常保存无状态行、共享鼠标编辑来源修复、成功报告按实际节点退出、紧凑待处理列表及窄窗工具栏。39文件302项、完整类型/fast/design/i18n/build通过，独立Spec/Standards固定2fdeab2..6b39d19无高价值发现。Agent未跑实机，用户复试与acceptance继续pending，既有SDKPDF/CLIfixture未知保持。详见最新[交接](handoff.md)。

## 2026-10-08 普通带图提交与公共压缩（07）

用户明确授权按二进制保存、冻结资源引用、临近 OMP 才编码的方向修复，并提炼可复用的高性能压缩工具，随后本地 commit。替换此前仅调整输入门槛的候选；本轮超预算图片的有界缩放/重编码获得授权，取代此票此前“不压缩”的限定，不扩展为图片编辑器。原件、私有摘要、来源版本、lease、Draft v1、ACK事务与unknown不重发保持。旧收据兼容读取；不把SDK输出帧限制冒称输入上限。

实现验收：908202-byte PNG不因Base64膨胀提前拒绝；新冻结收据与App传输只存资源引用；宿主读取受控私有目录、长度/MIME/摘要/软链/预算校验，失败不向OMP提交不完整内容；异步准备后暂停/身份变化不能越过准入；压缩方法公共、二进制、有界并发/像素/源大小/编码次数，小图不重编码，超限派生原件保留且转换信息可见；固定SDK资源打包与hash同步。Agent仅自动化/fixture/type/build与独立双轴评审，实机/provider验收由用户完成，不运行GUI/真实Host或provider，不push。

07工程完成：资源引用/延后编码、公共有界worker与类型化拒绝已实现；完整验证与双轴review见交接，本地提交后保留用户试用和acceptance pending。

## 2026-10-08 原生附件选择回返焦点（08）

用户指出Finder选图后鼠标outline仍出现，继续修复共享focus-visibility，补首次/重试/成功/取消的回返事件反例。只保留已获得鼠标来源的同一DOM焦点目标，键盘/独立无障碍焦点仍正常；不在Composer局部压样式、不改变异步插入/Undo/提交。仍由用户实机验收，Agent不运行GUI。

08工程完成，共享来源回返5反例先失败后修复，独立小范围两轴覆盖完成；模拟事件与真实Finder证据明确区分，用户实机复试pending。

## 2026-10-08 完整本地PR到main（09）

用户明确授权包含此前全部修改的本地PR合入main。固定原来源eb2e79c、目标cb233c6、实际mergebasea9cf9a9，37提交。整段独立双轴重新覆盖与完整检查，修复确证的重复@确认trigger遗留并完善门禁/fixture；GUI/真实provider与用户认可仍pending，不push。

09工程完成：完整本地PR已合入main，39来源提交含全部37先前提交、整段修复和治理收尾。实际身份见[合入记录](local-merge.md)，用户认可保持pending。
