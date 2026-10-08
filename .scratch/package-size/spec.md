# 打包体积收敛

## 推进与交接

- 2026-10-08 用户明确授权：充分分析并优化打包产物，避免不需要的平台内容，确保体积可控。
- 基点 `a0367becdf015a4b7fa7a31aa23050c74a275849`；本地分支 `codex/package-size`。主 Agent 串行实施，只读独立复核；不 push、创建远端 PR 或发布。
- 当前实测准备 SDK 逻辑大小 958,387,551 bytes（914.0 MiB），21,098 个普通文件。最大项为 OMP 本机 native、Bun、ONNX 跨平台库、浏览器 WASM、类型声明及 source map。用户提及的 1.2G 包尚无同身份实测；旧本机候选在调查中已不存在，不把其历史大小作为本轮前后对照。
- 交付：目标平台运行依赖闭包、保留原始许可与运行资源、实际 macOS arm64 包、体积报告与失败门禁。保留 OMP 已有 optional 能力及原生源码；不改执行、冷恢复、权限、数据结构或供应商行为。
- 沿用 D-02/D-03 的固定官方 SDK 薄宿主和现有单处 import 修正。允许裁剪未执行的分发文件，不新增原生源码修改，不 strip/rebuild 原生库；跨平台支持不扩张。
- 工程验收：先用真实反例测试跨平台资源与非运行内容被排除、依赖可解析和准备失败保留旧完整资源；再验证实际 SDK import、原生 fixture 控制、移位包内资源。初始体积预算 SDK ≤650 MiB、完整 `.app` ≤1000 MiB（逻辑大小，非压缩下载量或内存），预算超限打包失败，依赖升级需显式复核。
- 浏览器 WASM 不能仅因运行于 Bun 就删除：上游 optional Transformers/worker 可走 WASM，保留其运行资源。本轮保留模型目录数据、原始 native、源 TS、JSON、模板、Worker、Bun 和许可证；精简平台专用二进制、类型与 source map、SDK 不执行的 CLI bundle。
- 工程完成与实际交付见[交接](handoff.md)；最终同 ASAR 对照为 App 1,276,070,280 → 892,737,411 bytes，减少30.04%，SDK 958,387,005 → 575,054,136 bytes。未签名 ZIP 296,768,447 bytes；用户认可独立，未运行真实供应商/实际模型推理或 GUI 组合验收。

```project-status
[{"id":"package-size","title":"打包体积收敛","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","build":"0.1.0-workbench.3 / a0367bec-dirty-fa25a054；App851.4MiB / ZIP283.0MiB","evidence":["handoff.md","comparison.json","runtime-verification.json","license-verification.json","review.md"],"next":"试用体积收敛的macOS arm64本地包；以后升级依赖复核预算和运行闭包；用户认可独立。","constraints":"不改OMP行为或持久化；不扩平台支持；未签名不发布；全量tooling两个本机环境用例失败见交接。"}]
```

## 任务

- [01 SDK 与包体积收敛](issues/01-package-size.md)：串行单票，不建立额外 DAG。
