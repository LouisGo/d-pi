# 02 文档与 skill 收口

Status: resolved
Blocked by: none

阶段：既有 M1 重写。授权、待决项与继续边界见 [spec](../spec.md#推进与交接)。受影响决定：D-05、D-17、D-21/D-22、D-24、D-28–D-37 与 B-01，按实际触及项核对。

## 交付与验收

按规格二、三迁移高频正文、校准规则及导航；现行决定依据/日期与归档原始证据保留。写入者 docs_skills；共享源码与配置不改。

## Comments

2026-09-30：从准备提交的干净 `codex/rewrite-core` 开始；不维持旧内部类/补丁形态，但保持正确的产品合同、事务、恢复与执行所有权。完成后记录实际验证、未覆盖项与提交。

## Answer

2026-09-30：三份现行正文迁至 docs/architecture/overview.md、docs/product/requirements.md、docs/product/first-release.md；旧路径只保留跳转，活动引用同步。AGENTS 去阶段编年史，README 按 SDK 薄宿主路线，导航不复制状态；D-ID/日期/依据/取代关系与归档原文保留。state/query 区分政策/锁定库事实/推荐，校正 initializer 标注、禁用 observer 与 Mutation 的过度概括。主 Agent 的文档引用检查与 diff-check 通过。

未运行产品 GUI/构建，此波不产生新体验；SDK/干净环境在 03，问题源码在核心波。skill 标准 Python 校验器缺 PyYAML，子 Agent 用标准库核对简单 frontmatter；不声称该工具已运行通过。已验证源码入口后续再更新，S3 09 退出待决继续延期。
