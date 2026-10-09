# 固定 Linux x64 SDK 资源

Status: resolved
Blocked by: none
Owner: 主 Agent；codex/linux-e2e-repair；base c14297c3

固定 18.4.6 分发仅保留 baseline，使用官方 loader 的 modern→baseline 回退；缺少安全 baseline 时拒绝，未知版本/文件保持，不调高预算。验证复制、审计、许可、官方 loader 选择规则及准备事务。原 Linux 机器的真实 SDK import 留在交接复试，不冒称本机通过。

## 结果

2026-10-09：已实现精确分发与审计规则；SDK 打包/准备事务 13 项通过，两轴评审无未解决发现。原 Linux SDK 总量/import 属于平台复试，不计为本机通过；命令和限制见 [validation](../validation.md)、[handoff](../handoff.md)。
