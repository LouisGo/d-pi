# 设置页 Dev 交付

以下为初次独立工作树交付快照；当前 main 集成状态见文末。

2026-10-07，工程完成，已交付待试用，用户认可 pending。源码 `/Users/louistation/.codex/worktrees/settings-ui/d-pi`，分支 `codex/settings-ui`；生产实现 `d02201c`，最终验证工具与画面 `b0a7ab6`。主 main 未修改；没有远端 PR、push 或 merge。

设置现为外观、通用、配置与认证、提醒、诊断五类页面。沿用截图的大标题、圆角分组、行内分隔、说明与右侧控件；直接选择主题、语言和发送方式，认证表单和提醒开关接既有模型。支持 light/dark、窄窗横向导航、键盘与失败反馈。

名称、职责、类型与 API 先固定于 [spec](spec.md)，公开入口 `src/modules/ui/renderer/public.ts`。新增 Select、Switch、TextInput、FormField、ChoiceGroup、SettingsPage、SettingsGroup、SettingRow；原 Button 移至同一公开面并补 secondary。看板纳入新控件，基础层不持业务状态、IPC或翻译。

职责变化：原 `app/renderer/components/ui/button.*` 与 App 内堆叠设置，拆为 `modules/ui/renderer` 通用控件/配置布局 + `app/renderer/shell/settings` 页面组合；configuration 保留认证/Query，AppModel 与 AttentionModel 保留持久化及副作用。分类切换与 Modal 关闭不新增认证取消，不重建 Thread/编辑器。

在此工作树启动：

```sh
cd /Users/louistation/.codex/worktrees/settings-ui/d-pi
pnpm dev
```

依赖、Electron 与 SDK 已准备。默认 App 数据 `/Users/louistation/.d-pi/dev/d-pi-57086b5e8ed6`，启动器按 checkout 路径派生；原生 OMP 配置沿用现有共享方式。启动日志显示实际 source/data。Dev 允许 HMR，启动身份是快照，不能冒称固定包。

试用：打开侧栏「设置」，切换五分类；直接选主题、语言/发送键、保存提醒开关并观察状态；配置页查看当前 Thread 原生摘要。缩小窗口检查导航和表单，按 Tab/方向键/Escape 检查选择器与焦点。组件看板沿用开发导航，Forms 分类可试用新控件。

完整 `pnpm check`（836项通过、2项条件跳过）、`pnpm build`、8项隔离 Electron 场景通过。[验证详情与截图](validation.md)、[两轴评审](review.md)、[本地 PR 草稿](pr.md)。真实认证、OS 通知和用户认可未验证；GUI 桥为 fixture，不代表供应商成功。

## 本地 main 集成（2026-10-07）

用户明确授权合入 main；确认双方工作树干净、main 为原基点 `5c25d3c` 后，fast-forward 到已验证的 `64f9043`，无冲突、无生产代码重写。原检查与评审适用于相同源码；本轮仅补充集成记录与看板，复查 `pnpm check:fast`。尚未 push；用户认可保持 pending。

现在可从 `/Users/louistation/MySpace/Life/d-pi` 运行 `pnpm dev`。此 checkout 默认 App 数据为 `/Users/louistation/.d-pi/dev/d-pi-290bf7a6186d`，与独立工作树的 Dev 数据分开；OMP 配置共享规则保持。
