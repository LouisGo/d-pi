# 全应用指针与文本选择规范

日期：2026-10-06。阶段：基建。受影响决定：D-16、D-17、D-32。

## 范围与授权

用户确认：全应用禁止手形 `pointer`，点击由组件默认外观及 hover/active/selected/disabled/focus-visible 状态表达；默认禁止文本选择，输入、阅读正文、代码、文件/Diff、可复制诊断与路径明确开放。保留 text、resize 等功能性指针。用户随后明确“确认，开始”。不改变业务行为、认证或 OMP 所有权。

## 推进与交接

- 工程：实现、完整检查与专项验证已在独立 worktree 完成。分支 codex/interaction-policy，增量基线 31cb91229852d8c6dfabb6e88fce06e78cbf6030；按用户选择向 codex/m2-lifecycle 提 PR。
- 待决：无。
- 验收：源码门禁正反例；隔离 Electron 中实际计算样式、鼠标拖选、输入/Monaco 选区及点击/键盘反馈；受影响主题/密度；相关类型、lint、构建。隔离桥接不构成真实供应商验证。
- 用户试用：尚未交付；工程通过不代表用户认可。
- 继续边界：用户已选择向 codex/m2-lifecycle 提增量 PR，并明确允许先发布该基线分支；本次分支 push 与 Draft PR 已授权。不 merge、不发布安装包，用户认可仍待试用。

## 实现结果

- interaction.css 是全局指针/选择策略单源，覆盖普通控件、控件后代及 body 级 portal；保留内容 text 和 Monaco/Diff sash resize。
- 阅读消息、原生历史、收据、子 Agent、队列及原生交互正文显式 data-selectable；编辑输入、诊断、路径和预览按中央例外开放。控件和消息 heading 始终不可选。
- 共享按钮补充按下色及选中导航的 hover/active；summary、链接、select、checkbox/radio 有反馈和键盘焦点。configuration 的原生按钮复用 ui-button 变体样式，保持模块边界。
- 源码门禁拒绝 CSS/工具类/静态 inline、style.setProperty、cssText、setAttribute 的 pointer 与局部选择例外；原生 button 必须接入静态共享样式。快检和完整设计检查均执行；禁止删除中央样式导入。

## 验证记录

- 先运行门禁确认红灯：当前 4 个 pointer 声明和 6 个未接入共享状态的原生按钮被拦截；修复后门禁及正反例通过。
- pnpm validate:interaction 通过，使用真实 Electron 和正式 App/组件，读取晚加载 Monaco/Diff 样式；覆盖默认禁选、正文鼠标拖选、Monaco 原生键盘全选、控件禁选、portal、4 个主题/密度组合的指针与选择样式；dark/compact 下按钮/icon/链接/summary/普通与选中导航的视觉反馈、disabled 与 focus-visible。证据为 evidence/native.json 和 evidence/interaction-dark-compact.png。
- pnpm typecheck、lint:design、i18n、设计正反例、源码边界、architecture 和 documentation 已通过；应用测试 120 文件/711 tests 通过，2 个既有 skip（含原生 smoke 显式 opt-in）。pnpm build 通过。Impeccable 机械检测结果为空。
- 动态 JS 数据流和所有未来第三方控件不属于静态扫描证明。当前最小 editor.api 未注册可见 context menu；相关作用域规则保留，但不冒称已验证不存在的原生菜单。
- 最初共享工作区验证被并行修改打断；随后独立 worktree 以固定基线完成 pnpm check、pnpm build、pnpm validate:interaction。迁移时对 28 个捕获文件校验 SHA-256，只有仍匹配本次写入的共享差异被撤回，其他 chat 的文件保留；证据见 evidence/migration.json。较早临时源码快照的检查亦通过，见 evidence/snapshot.json，仅作历史记录。

- 独立 Spec review 发现文件“采样详情”正文禁选，已补中央选择例外；原生验证先复现红灯，再确认正文可拖选而 summary 仍不可选。补丁后 pnpm check:fast、pnpm typecheck、pnpm lint:design、pnpm build 和原生专项均再次通过，未重复无关应用测试。完整检查与回归红灯日志见 evidence/*.txt。Standards 轴已覆盖模块边界、中央级联、门禁及隔离资源释放；最终复核见 review.md。

## 用户试用

本次修改仅在独立 worktree /Users/louistation/.codex/worktrees/interaction-policy/d-pi，应用构建已更新；在该目录启动 pnpm dev 可试用。共享工作区已撤回本次差异。未覆盖安装包重打包或真实供应商，不将工程结果写成用户认可。试用重点：导航、按钮/icon 和折叠标题均使用箭头，标签拖动不误选；正文、输入、代码/文件/Diff 与诊断信息可选择；按下/选中/禁用/Tab 焦点有正确反馈。
