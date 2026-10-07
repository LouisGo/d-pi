---
status: accepted
---

# 专用 TerminalHost 承载用户 PTY，主页面用 xterm.js

日期：2026-10-07。对应 D-40。用户明确要求“直接按照 B 方案”修改方案和文档，并允许后续按需直接引入 xterm.js。此决定确定实现方向，本轮仅授权方案与文档，不授权终端开发或新增终端依赖、push或合并。D-13 的底部终端与快捷键、D-02 的 SessionHost/OMP 所有权、D-25/D-26 的渐进阶段继续有效。

用户交互终端能运行长寿命shell和高输出程序，它不能占用OMP连接宿主的进程与资源作用域。采用一个专用 Electron utility process TerminalHost，管理 node-pty/shell、受管进程身份、有界headless屏幕与输出流控；Main 管目录/执行信任、启动准入、通道建立、宿主监督和退出；主页面 Renderer 使用 xterm.js。输出直接走受限 MessagePort，Main不逐块转发。

这样可以把native PTY/宿主崩溃与SessionHost/OMP分开，也复用现有Electron通道和监督组织，不为桌面终端引入HTTP/WebSocket后端。utilityProcess提供Node与MessagePort，但没有“比普通Node子进程天然更快”的结论。xterm浏览器解析/绘制仍与主页面共享Renderer；有界信用、处理确认与按帧调度减小压力，效果必须实测。多个终端先共用一个Host，接受公共故障域与4会话初始上限。

恢复显示采用同版本体系的 headless/serialize 有限屏幕，不存整份输出历史；代价是后台解析、屏幕缓存和快照成本。PTY pause可能使程序输出阻塞，不能保证无限吞吐与shell永远不阻塞。Host重启只创建新宿主，不能接回已退出shell；旧实例清理必须先核实身份，不能仅按PID杀进程。独立Renderer只在已证实共享页面瓶颈且局部修正不足时再评估。

本ADR细化P-04的终端部分，xterm.js/node-pty与专用TerminalHost不再保持未选择候选；P-04的浏览器/PNG等其余部分不受影响。不扩D-39的Effect授权；不登记尚未实现的模块或native包。

行为、身份、许可、输出与清理的唯一详细依据是[终端契约](../architecture/terminal.md)，正确性与性能门槛是[验证设计](../validation/terminal.md)。[固定源码核实](../architecture/terminal-references.md)只提供架构事实和可追溯依据，不承诺d-pi实测结果。产品待决、实现顺序和当前授权见[所属规格](../../.scratch/integrated-terminal/spec.md)。
