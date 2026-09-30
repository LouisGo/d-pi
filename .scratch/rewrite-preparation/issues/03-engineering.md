# 03 可复现工程入口

Status: resolved
Blocked by: none

阶段：既有 M1 重写。授权、待决项与继续边界见 [spec](../spec.md#推进与交接)。受影响决定：D-05、D-17、D-21/D-22、D-24、D-28–D-37 与 B-01，按实际触及项核对。

## 交付与验收

按规格四自动化及五：现有架构门禁复用、文档引用负例、版本/资源/异常环境诊断、受控测试环境、干净目录安装/准备/检查/构建/启动。scripts 与 tooling 测试写入者 engineering；共享配置、资源和构建主 Agent 串行协调。

## Comments

2026-09-30：从准备提交的干净 `codex/rewrite-core` 开始；不维持旧内部类/补丁形态，但保持正确的产品合同、事务、恢复与执行所有权。完成后记录实际验证、未覆盖项与提交。

已接入 Node 单一版本入口、实际工具/SDK资源检查、文档本地引用与机器依赖快照；规则单源仍为 modules.json。允许依赖和实际导入分开，覆盖 183/183 源文件、752 项导入、无未扫描/未解析/例外；源码或扫描器变化会让 check:structure 失败，审查后显式生成。门禁与受控环境 37 项 Node 测试进入标准 check，具体负例覆盖私有目录 index 导入、陈旧快照、失效锚点/D-ID、工具缺失/崩溃、隐藏 package exports、未知未来凭据和实际子进程隔离。

独立目录 `/tmp/d-pi-rewrite-clean-engineering` 从 `d9a991a` 源码加冻结工程 diff 开始，全新 `/tmp/d-pi-rewrite-clean-store` 联网冻结安装；未使用主 checkout 的 resources/sdk、全局 OMP 或依赖缓存。首次完整 check 发现初始化测试两处 spy 类型错误，补修 `3817d5d` 后按原失败点重跑通过。完整 check：37 项 Node 门禁、304 项 Vitest、1 项显式原生 opt-in 跳过；build、独立 SDK 控制冒烟与 pnpm dev 实际启动通过，截图已主 Agent 核对。Node 24.21.0 / pnpm 10.5.2 / Bun 1.3.14 / Electron 44.4.5 实际内嵌 Node 24.21.0 / SDK 18.3.0，darwin-arm64。

固定证据见 [环境与重试记录](../evidence/clean-environment.json)、[完整检查](../evidence/clean-check-repaired.txt)、[启动 trace](../evidence/clean-restore-trace.jsonl)。源码导出目录没有提交身份，构建明确显示 unknown-dirty；不能当正式交付标识，07 将对冻结 commit 生成可识别包。SDK 模型响应为本地 fixture，不是实际供应商；启动检查没有执行真实项目。README 补串行 install-electron，避免并行首次导入下载；仓库没有现行 hook/CI，提供快速入口供本地 hook 调用，标准检查可由受支持 CI 复用，未静默安装 hook。
