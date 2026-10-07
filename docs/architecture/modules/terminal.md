# 集成终端

日期：2026-10-07。深度：M3 可实施契约与任务基线。D-40 已确认 B：专用 TerminalHost utility process、node-pty、主页面 xterm.js；本次只交付设计与文档。依据 D-13/D-25/D-40；[所属规格与授权](../../../.scratch/integrated-terminal/spec.md)、[详细契约](../terminal.md)、[验证设计](../../validation/terminal.md)。返回[模块地图](README.md)。

## 当前工程落点（2026-10-07 核实）

- 无。尚未在 [`architecture/modules.json`](../../../architecture/modules.json) 登记模块，也没有对应源码目录。后续实际公开面、环境、跨模块依赖落地时才登记；当前源码与固定参考事实见[核实记录](../terminal-references.md)。

## 用户场景与所有权

用户通过 Command + ` 打开底部终端，直接输入命令并运行程序。Main 拥有目录关联、执行信任准入、宿主监督与退出协调；专用 TerminalHost 拥有 PTY/shell、真实输出顺序和有界恢复屏幕；主页面 Renderer 的 xterm.js 适配拥有显示、选择与键盘输入。Main 不逐块转发输出，TerminalHost 与 OMP 的 SessionHost 分离。

这是用户交互终端，OMP shell 工具仍由 OMP 执行。两者可以在相同目录产生文件变化，但不共享终端输入或凭日志推断作者。

## 交接

| 依赖 / 输入 | 本模块负责 | 输出 |
| --- | --- | --- |
| [Thread](threads.md) 的工作目录与执行信任 | Main 固定目录身份与准入，Host 在 spawn 处复核，不在仅浏览模式启动 shell | 终端会话身份或明确失败 |
| 用户输入、尺寸与显式结束 | 通过受限宿主接口操作目标会话 | 有界输出、退出状态、操作结果 |
| 宿主退出流程 | 报告仍运行的终端资源，参与退出处理 | 明确关闭/终止结果，不能静默遗留子进程 |
| [文件](files-editor.md)、[Git](changes-git.md) | 只共享目录事实，按实际需要刷新 | 磁盘变化，不冒称 Agent 修改 |

隐藏/卸载只 detach 显示，结束才释放 PTY 与受管进程；目录、退出交互两项产品待决集中在 spec。终端屏幕、输出/输入不复制到诊断或 OMP 历史。详细状态、身份、snapshot/增量、处理确认、pause/resume与超限行为只维护在[终端契约](../terminal.md)，本页不建立第二份预算。

## 后续开发入口

从[任务依赖](../../../.scratch/integrated-terminal/spec.md#开发切片与依赖)推进：可信 PTY/生命周期 → 协议与屏幕恢复 → 有界输出 → 工作台 → 多终端/组合退出 → 验证交付。计划与文档完成不授权开发；xterm路线已定，后续无需重复询问库名。Effect 不默认扩到 terminal。

初期不恢复跨 App shell，不存全量输出或建设通用任务运行器；重挂载恢复现存 Host 屏幕，shell 已退出就是退出。native ABI、启动代码前的身份登记、进程组清理、中文 IME 与输出硬界按相关票核实，不做泛化产品对比。

## 验收场景

完整安全/正确性、同负载性能及 GUI 门槛见[验证设计](../../validation/terminal.md)。特别是终端故障不终止 OMP、输出有界、输入不自动重放、清理范围真实、共享 Renderer 的输入尾延迟过线；高吞吐或评分不能抵消硬失败。当前无实测通过结论。
