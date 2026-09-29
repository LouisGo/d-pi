# 国际化基础试用交接

2026-09-29，源码候选 `0.1.0-i18n.0`。按 D-36 在 S4 前完成中英双语基础；当前工程验证已完成，交付用户试用，尚无用户体验认可。未打包新的 macOS 候选；此前 `dist/s3-candidate` 是旧构建，不含本轮改动。S3 的只读恢复限制继续有效，S4/M2 未实施。

## 已交付

- `system`、`zh-CN`、`en-US` 偏好由 Main/SQLite 持久化；`system` 保持为偏好，启动时按当前 macOS locale 解析。语言选择即时改变 Renderer 和应用菜单，后续原生对话框使用同一语言；保存失败不撤销本次选择，界面提示下次启动可能恢复旧值。
- 当前 Renderer 的 d-pi 自有文案、状态、草稿/提交错误、辅助功能标签与 Main 菜单/弹窗进入共享 typed catalog；支持 ICU 动态参数与英文复数。跨层传稳定语义码与受限参数，现有状态在切换后会重新显示。用户、Agent、工具、原生交互、路径、URL、模型名与外部诊断内容仍保留原文。
- 双语 key parity、ICU 格式检查及主要 Renderer TSX 的明显写死文案守卫进入 `pnpm check`。完整架构基准见[国际化架构](../../docs/architecture/internationalization.md)，盘点和任务见[规格](spec.md)。

## 启动与试用

在本仓库运行：

```sh
pnpm install --frozen-lockfile
pnpm runtime:sdk
D_PI_DATA_DIR="$HOME/Library/Application Support/d-pi-i18n-trial" pnpm dev
```

`D_PI_DATA_DIR` 只隔离 App 偏好和草稿，不隔离 OMP 原生配置。只检查语言、菜单、空状态和项目选择弹窗时无需允许项目执行。菜单与对话框里的系统控件仍按 macOS 自身语言显示；d-pi 定义的标题和说明随界面语言显示。

建议按顺序试用：

1. 顶栏“界面语言”选 English，确认项目/空状态、按钮、辅助标签与原生 `Edit`/`Window` 菜单立即切为英文；打开“Choose a project and create a draft”，核对标题后取消。
2. 选“简体中文”，确认界面和“编辑”/“窗口”菜单同步切回。切换明/暗主题和正常/紧凑密度，确认语言选择可读、可聚焦，布局无明显遮挡。
3. 关闭并重启同一试用数据目录，确认显式语言选择保留。选“跟随系统”后重启，确认按当前 macOS 语言解析；若之后改系统语言，再次启动应跟随新系统语言。
4. 如继续试用 S3 原生工作，核对状态、安全警示、提交回执在两种界面语言下变化；草稿、Agent 回复、工具结果、原生交互正文和模型名保持原文。S3 原生执行权限与恢复门槛仍按[S3 交接](../m1-s3-control-recovery/handoff.md)。

## 本轮验证与限制

- `pnpm check`：TypeScript、Biome、设计 lint、i18n 守卫、设计与源码边界检查通过；Vitest 40 文件/177 项通过，另 1 项可选 smoke 跳过。
- `pnpm build` 通过；Vite 报告既有大 chunk 警告，未把本轮语言文件做动态分包。
- 使用隔离 App 数据的真实 Electron 开发窗口，观察到中文 `system` 启动，选 English 后界面和原生 `Edit`/`Window` 菜单同步切换；原生项目选择对话框的 d-pi 标题为英文；深色/紧凑布局下选择器可读、未见遮挡。未进行完整用户任务或正式包验收。
- 未验证系统语言实际改变后的重启、偏好写入失败的真实磁盘故障、签名/公证包或 Windows/Linux。自动化验证和本轮 GUI 样本不替代用户试用反馈。
