# 04 集成验证与试用交接

Status: claimed
Blocked by: 02, 03
阶段: M1 基建（D-37 对齐切片）
受影响决定: D-37

## 交付结果

在受影响的真实路径上完成集成验证，形成可复现记录与试用交接：

- `pnpm check` 全项与 `pnpm build` 通过；记录实际通过项与跳过项（例如可选原生 smoke），不把未跑的检查写成通过。
- 开发态真实路径核对：打开项目 → 目录树与文件查看 → 冻结选区附入输入 → Git 当前差异与单文件 Diff → 执行面板提交/交互/停止 → 主题与密度切换。记录受影响路径的实际表现与未覆盖项。
- 结构一致性：`core`/`contracts` 无 React 导入；四个模型不再各自实现 `listeners + publish`；`pnpm report:structure` 显示 `unowned=0`。
- 交接：更新切片 spec 的"推进与交接"、写入交接文件，说明启动/操作步骤、预期结果、已知限制与本次未覆盖的层级（例如未跑打包矩阵、未获取用户反馈）。
- 本地 commit（不推送）：文档与实现按仓库约定分开或合并提交，说明受影响决定与验证范围。

## 真正依赖

02、03。

## 验收证据

- 检查与构建的实际输出摘要；失败项与修复记录。
- GUI 路径的核对记录；无法自动化的原生/视觉项如实标注。
- `git log` 中的本地提交；工作树状态说明。
- 明确写出：自动检查与 Agent GUI 核对不替代用户试用，S3/S4 的试用与恢复边界不因本切片改变。

## Comments

- 本切片不新增用户功能；试用重点是"行为与迁移前一致"以及两个库真实承载状态与查询后受影响路径没有退化。

## Answer（部分完成，试用项未完成）

已完成：

- `pnpm check` 全项通过：类型（core/renderer/main/host/preload）、Biome、设计 lint（`PASS: design lint`，46 文件 6 规则）、i18n 文案检查、边界与结构、架构门禁、测试 **285 通过 / 1 可选跳过**（`pnpm check:architecture`：175 源文件；报告 `unowned=0`）。
- `pnpm build` 通过；`monaco-viewer-*.js` 为独立 chunk，证明编辑器已脱离主包静态图。
- 一致性抽查：`core`/`contracts` 无 React 导入（`source-boundaries` 与架构门禁）；四个模型不再各自实现 `listeners + publish`（`grep` 确认已无手写监听集合）；`QueryClient` 只在 `src/app/renderer/query-client.tsx` 创建一次。

未完成（需要你的终端）：

- 本会话环境设置了 `ELECTRON_RUN_AS_NODE=1`（DSH 桌面 harness 注入），Electron 二进制被当作纯 Node 运行，`pnpm dev` 在启动阶段即报 `The requested module 'electron' does not provide an export named 'BrowserWindow'`。**已用 `git stash` 在干净基线上复现同一失败**，因此这是会话环境限制，不是本切片缺陷。真实 GUI 核对（目录树/文件查看/选区附入/Git 差异/执行面板/主题密度切换）尚未执行。
- 因此本票不标 resolved：它包含用户体验验收项，未收到反馈前保持 claimed。

试用步骤（在你的终端，非本会话）：

1. `pnpm dev`；若无 GUI 报错，打开/选择一个项目并创建草稿。
2. 文件区：展开目录、切换若干文件、点刷新；确认切换时不会短暂显示上一个文件的内容，刷新后时间戳/版本更新。
3. Git 区：查看当前差异列表与单文件 Diff；在终端改动一个文件后再点刷新，确认重新采样。非 Git 项目应显示"非 Git"而不是空差异。
4. 执行面板：提交一次消息、回答一次交互、停止一次；确认发送/停止路径未走 Query（无自动重发迹象）。
5. 主题与密度切换；确认输入内容与焦点不丢。

已知限制：`pnpm check` 在本机需要 Node 24.21.0（`~/.nvm/versions/node/v24.21.0/bin`）；Node 24.17.0 下 oxlint 设计检查的 JS 插件 worker 会 SIGTRAP，脚本会报工具故障而非规则结果。该问题与本切片无关，已记录在 01 票。

## Comments（提交后状态）

- 文档与实现已分两次本地提交：`4b6d0db`（决定/规格/合同/模块地图）、`32807ca`（依赖与迁移）。提交后 `pnpm check` 退出码 0（设计检查里的 `FAIL: design lint crashed` / `oxlint-that-does-not-exist` 是 `validation/s1/design-check.mjs` 故意注入的负例，用于证明工具故障不会被当成规则通过）。
- 版本号保持 `0.1.0-s4.0`：本切片尚未形成交付给用户的试用候选，不虚报新版本；等 GUI 试用通过后再按既有节奏（`0.1.0-sN.M`）分配。
