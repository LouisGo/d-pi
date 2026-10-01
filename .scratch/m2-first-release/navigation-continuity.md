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

已交付 clean macOS arm64 本地候选；交接记录提交只补文档/证据，不改变下面的精确构建源码。

- 源码：`c00f3dc5be1c6855c480c81c7a10013cb6ddf2e6`，dirty=false；版本/构建：`0.1.0-m2.10 / c00f3dc5-e027fc01`。
- App：`/Users/louistation/MySpace/Life/d-pi/dist/navigation-m2.10/mac-arm64/d-pi.app`。
- ZIP：`/Users/louistation/MySpace/Life/d-pi/dist/candidates/d-pi-0.1.0-m2.10-c00f3dc5-mac-arm64.zip`。
- ZIP SHA-256：`7682a3dfe327b72e76d3de7a070db436d0d254c70a294c893c9e13219a1768ba`。
- app.asar SHA-256：`da12dcfda41694d563170dcbdf1c23251e0c0905a2866e73892179b36c4d467e`。ZIP 完整性通过，ZIP 内 app.asar 与实际验证源包一致。[身份记录](evidence/navigation-candidate.json)。
- Build/pack 与固定资源环境核对通过；既有 Router 循环依赖/大 chunk 提示保留，未改警告门槛。首次隔离 checkout 的依赖目录 symlink 不被 pnpm/SDK 管理规则接受，改为独立 COW 副本后通过；最终 checkout 干净，锁文件/工具版本未变。

### 实际桌面与回归

实际执行 `node validation/m2/package.mjs <上述App> --router --continuity --inspect`：[完整结果](evidence/navigation-candidate-result.json)、[原始运行](evidence/navigation-packaged.txt)。14 项检查通过，只有 2 次 localhost fixture 供应商调用；两个真实 OMP scope 并行、不同模型/档位/草稿/消息、冻结多行发送、独立选区与 undo/redo、四页签和 back/forward、可信 Chromium IME、Renderer 刷新无重发、冷旧记录只读与明确新 Thread 出口均通过。7 次实际 Thread 切换共 58 个采样（42 个绘制帧、16 个 DOM mutation），公共壳/侧栏/工具栏身份保持，工作区与编辑器都有非零几何，未再出现基线空样本；近底部阅读位置精确恢复。该代表性采样不冒充全负载性能或完整 Codex 体验验收。

Computer Use 在隔离包 `local.d-pi.m2-validation` 的真实 macOS 窗口中切换 B→A，核对 B 的 `fixture-a` / `B_UNSENT_DRAFT` 与 A 的 `fixture-b/high` / `A_UNSENT_DRAFT`；输入区和发送入口可见。原生历史页的当前绑定记录经明确“读取原生记录”成功显示多行用户输入、最终助手正文与 parent ID，草稿保持。fixture 没有 CLI 写入的项目历史，目录页显示暂不可读/尚未保存，不把绑定记录阅读冒称 CLI 历史发现实测；CLI 目录行为沿用已有隔离集成测试。该次刷新期间 stderr 有旧 frame 的 `Invalid history source` 拒绝及 Electron frame 提示，当前窗口绑定读取随后成功；保留日志，不冒称零报错，也未放松 IPC 来源守卫。[窗口](evidence/navigation-m2-parallel-entry.png)、[冷后新会话](evidence/navigation-m2-cold-new-thread.png)。

### 复试步骤

1. 解压新 ZIP，确认左下角为 `0.1.0-m2.10 · c00f3dc5-e027fc01`；使用原有项目与历史 Thread。
2. 在 A 阅读长输出的中间/靠后位置，留下草稿，再切换 B 并返回 A：公共壳保持，工作区不会先清空，正文/模型/草稿属于对应 Thread，阅读位置恢复；再验证 A/B 各自撤销。
3. 切换会话/文件/提交原文/原生历史页签及后退/前进，核对对应资料和阅读位置。Shift+Enter 换行后显式发送，冻结原文保持多行。
4. 从冷旧 Thread 通过顶部“新会话”进入独立会话，按真实原生模型/档位选择并启动；旧原生会话继续只读，不解禁旧执行或自动重发 unknown。真实供应商生成由用户正常试用，Agent 本轮未消费个人凭据/计费。

M2 全集工程仍 in-progress；本轮基础主流程候选已交付待复试，用户认可 pending。附件、完整队列、子 Agent、M3 和完整阅读/诊断矩阵保持原票。

## 范围与限制

OMP 18.4.6 和既有受控 staging import 修正保持。unknown 不自动重发、冷恢复只读；附件、完整队列、子 Agent 与 M3 原票保持。滚动坐标属于本 Renderer 生命周期，不跨应用重启持久化；不承诺尚未完成的历史选择/完整阅读增强。真实供应商费用、系统输入法全矩阵与用户认可不由隔离 fixture 或工程通过推导。
