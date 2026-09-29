Status: resolved
Blocked by: 01, 02, 03, 04

# GUI、验证与试用交接

M1。合并文件、选区、Git 与工具证据视图；按 S4 spec 完成自动化、构建与必要 GUI 检查，记录试用步骤与限制。不把工程验证写成用户认可，不推送。

## Comments

2026-09-29：`pnpm check`、`pnpm package:mac`、包内 worker 资源及 `git diff --check` 通过。隔离开发态与包内完成只读文件、Monaco 选区、主题/密度的实际操作；包内另核对 Git 各来源与 Diff 两侧、非 Git、文件缺失、外部变化、重启后引用保留。试用步骤与覆盖边界见 [交接](../handoff.md)。原生工具修改只有合同/记录测试，没有可读的真实原生工具样本；用户试用和显示反馈待确认，不冒称用户认可。
