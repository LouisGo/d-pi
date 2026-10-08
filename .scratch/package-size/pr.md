## Summary

同一应用构建的原SDK资源让macOS包达到1.28GB；本切片按目标平台运行闭包裁剪分发冗余，完整App降至0.89GB（30.04%），并保留已有OMP能力和原始资源字节。准备/包后增加650MiB SDK与1000MiB App预算、平台/哈希/链接/ASAR门禁。范围见[规格](spec.md)及[交接](handoff.md)。

## Evidence

本地 PR 已合入 `main`：2026-10-08，base `a0367becdf015a4b7fa7a31aa23050c74a275849`，source `codex/package-size` / `c0d93ea`，merge `a8a8663e0a90dfde903fff004016adfc82160d1c`。提交hook的 `check:fast` 实际通过；无远端 PR、push或CI结果。包仍为交接记录中的WIP构建，合并未重新生成候选，用户认可保持pending。

20项相关测试、build、环境/静态门禁、四项实际固定SDK本地fixture与移位包内资源/optional导入通过；同ASAR前后体积见[JSON](comparison.json)，两轴独立复核无高价值遗留见[review](review.md)。全量tooling有两个未修改的本机路径/Corepack用例失败；未运行完整check/GUI/实际推理/真实供应商或CI，不声称用户认可。已生成未签名本地App和ZIP，不以远端PR为交付前置。

## Merge Danger

变更影响SDK资源选择和包后检查；未来上游新增未声明依赖/文本资源或改变native布局，需要复核当前规则和预算。无数据库、原生配置或权限迁移，回退配置/脚本并重新准备资源即可；准备仍须关闭同SDK根使用者。不升级OMP或公开发布，签名/公证独立。
