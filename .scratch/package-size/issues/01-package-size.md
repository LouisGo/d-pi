# SDK 与包体积收敛

Type: task
Status: resolved
Blocked by: none

Owner: 主 Agent，`/Users/lou/Learn/d-pi`，`codex/package-size`，基点 `a0367be`。

## 验收

- SDK 只复制声明的运行依赖、可用 optional/peer 和匹配目标 os/cpu 的包；所有保留依赖链接在资源根内闭合。
- ONNX 只保留目标平台架构二进制；类型声明、source map 与未使用 CLI bundle 不入资源；许可证及实际源码/模板/worker保留。
- 准备仍独占锁、staging import 校验、原包哈希修正与原子替换，失败不损坏旧资源。
- 实际 macOS arm64 包无开发依赖重复入 ASAR，无外部依赖链接；SDK≤650 MiB，完整app≤1000 MiB。打包流程自动输出分项报告并在越界或资源错误时失败。
- 固定 SDK 的受影响无网络 fixture 行为和移位包内资源验证通过；记录覆盖、未覆盖与独立两轴复核。

## Answer

20项受影响确定性测试、build、环境/静态门禁与真实固定 SDK 本地 fixture 通过；移位包内共享 Main 资源校验、Bun/SDK factory、ONNX dylib 与 Transformers ESM 导入、SDK停止/继续通过。完整app由1216.96MiB降至851.38MiB；SDK降至548.41MiB。原子资源发布、权限与数据合同未改变。独立两轴无高价值遗留；全量tooling有两项未修改的本机环境失败，具体限制见[交接](../handoff.md)。工程resolved不代替用户认可。
