# 01 可信 PTY 与受管生命周期

Status: open
Blocked by: 00
阶段：M3。受影响决定：D-02/D-05/D-13/D-21/D-22/D-40。

实施授权与T-P1/T-P2见[spec](../spec.md#产品待决)。只在授权与所需产品答复明确后领取；xterm/node-pty方向已定，不重开选型。

## 行为与资源

按[契约 §1–3](../../../docs/architecture/terminal.md#1-范围与所有权)实现Main准入、专用TerminalHost、真实node-pty/shell和身份登记；关联/环境从可信Main取得。Main拥有许可/监督，Host拥有PTY，组件不拥有shell。实现最小退出屏障，未结束/未清理资源禁止静默退出。

同票完成Electron ABI与native资源准备、受控bootstrap在项目代码运行前登记、自然exit/显式end/Host故障的组身份核查。关键未知用最小真实Electron样本：登记前shell不能执行marker；Host强杀后已归属组清理，不误杀并行OMP。不能证明门控或清理则保留失败并停止发布该路径，不扩大为通用进程框架。

## 验收证据

先写权限/身份/生命周期的目标失败测试，再接实现。真实utility创建/输入/resize/终止及macOS arm64包内native加载有结果；拒绝旧许可、目录变化与重复create；TERM忽略/PID复用/组内与逃逸范围分别留证。release待监听、PTY句柄、登记和临时资源按[契约 §6](../../../docs/architecture/terminal.md#6-生命周期与清理)核查。记录诊断无环境/输入/输出秘密，Effect范围不扩张。发布公开面/实际依赖时才更新机器登记。
