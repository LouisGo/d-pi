# M2 会话切换连续性

2026-10-01。当前用户认可仍 pending；本轮只接续已承诺基础主流程，本地 commit 与候选，不 push、不公开发布。

## 基线与判断

用户体验的源码 `d7412cea120987cee1b8c3e8da7eb52cbda7878c`、构建 `0.1.0-m2.9 / d7412cea-c01373c5`。使用对应 clean 包、隔离 App/OMP/HOME/Git/项目与 localhost provider，在第一轮 A/B 切换观测 DOM MutationObserver 和 requestAnimationFrame：公共 shell/sidebar/toolbar 连续存在，但 Thread 工作区及编辑器出现空样本。[实际包红灯](evidence/navigation-package-red.txt)。

根路由已有 Outlet；当前证据不能把整个应用壳重挂载或 defaultPendingMs=0 当作根因。实际缺口是 AppModel 已发布 B、Router 仍呈现 A 的交接间隙，ThreadPage 身份守卫返回 null。此前包内回归只验证切换结束后的状态，没有检查切换中间的可见连续性，因而漏检。

## 修复与证据

- ThreadPage 保留最后一次匹配当前路由的旧工作区引用，交接期间 frozen/inert/aria-busy，Router 参数与 Main 真实选择一致后替换。绝不将 B 的模型绘制到 A 路由；unknown/失效仍撤下工作区。无需重做公共壳或添加第二份业务状态。
- ThreadModel 保存阅读坐标，ReadingPane 在返回时恢复；这是应用视图状态，不复制或改写 OMP 原生内容/队列/执行。编辑器仍用已有按 Thread 身份的 draft cache，草稿保存、选择与 undo 所有权不变。
- 真实 React/AppModel/Router/Composer 回归：工作区连续性与 Thread 阅读位置均先失败后修复；公共壳稳定与 unknown 撤下属于既有正确行为回归，不伪造红灯。[工作区红灯](evidence/navigation-red.txt)、[阅读位置红灯](evidence/navigation-scroll-red.txt)。
- 完整工程检查通过：482 行为测试、33 架构、47 tooling；1 项固定 CLI artifact opt-in 跳过。Node 24.21.0 / 当前仓库声明 pnpm 12.8.1，未改工具版本/锁文件或降低门禁。[检查](evidence/navigation-check.txt)。

首个 clean 修复源码 `2231c4c` 的实际包检查在同 Thread 页签返回时失败：Chromium 隐藏面板后 `scrollTop=0`，新清理逻辑覆盖了可见坐标。该包未交付；保存时跳过 hidden viewport，新增真实 DOM 属性边界的失败回归后修复。[包红灯](evidence/navigation-first-package-red.txt)、[回归红灯](evidence/navigation-hidden-scroll-red.txt)。Shift+Enter 已在该次实际包检查先通过；最终仍随修正包复核。

第二轮实际包在跨 Thread 返回阅读位置的新增断言失败：初次恢复 2120 被挂载中视口截为 2068.5，最终视口仍可容纳原位置。新增挂载中 scroll range 边界失败回归，保留原坐标至 Composer 挂载后在下一绘制前补一次恢复；cleanup 取消帧回调，恢复中 clamped scroll 不写回。没有放宽原包内断言。[实际包失败](evidence/navigation-second-package-red.txt)、[视口回归红灯](evidence/navigation-viewport-red.txt)。

## 候选交付

当前准备 `0.1.0-m2.10` 的 clean 本地 macOS arm64 包。包内验证、精确源码/构建/哈希及步骤在完成后补充；不以未验证包冒充交付。

## 范围与限制

OMP 18.4.6 和既有受控 staging import 修正保持。unknown 不自动重发、冷恢复只读；附件、完整队列、子 Agent 与 M3 原票保持。滚动坐标属于本 Renderer 生命周期，不跨应用重启持久化；不承诺尚未完成的历史选择/完整阅读增强。真实供应商费用、系统输入法全矩阵与用户认可不由隔离 fixture 或工程通过推导。
