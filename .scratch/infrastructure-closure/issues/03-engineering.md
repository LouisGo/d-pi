# 03 工程门禁与入口

Status: resolved
Blocked by: none

范围与授权见 [spec](../spec.md)。复用快速/完整入口，保护已有 hook/config；平台准确的 CI；精确依赖和模块/工具负例。

## 验收

工程入口与门禁于 `3285474` 入库：模块公开面/环境/禁止依赖、工具失败分类、声明/锁一致性、macOS arm64 CI 和可卸载 hook。新增门禁有真实负例；版本仍以 package/lock 为准，基础集合不复制散文决定。D-07 Monaco 必需声明的遗漏另有[红灯](../evidence/monaco-declaration-red.txt)和[绿灯](../evidence/monaco-declaration-green.txt)，仅补一个集合键，独立定向 7/7 通过。

当前 checkout 已实际 `pnpm hooks:install`；[安装前](../evidence/hook-before.json)/[安装后](../evidence/hook-after.json)核对原 hook 文件与全局 hooksPath 保留。[真实非法状态提交](../evidence/hook-rejection.txt)由 check:fast 拒绝、HEAD 不变；[正常补修提交](../evidence/hook-success.txt)通过同一 hook，提交为 `2d671e8`。其它 linked worktrees 继续原 hooks，未改全局配置或开启 worktree 配置。

[固定环境与 SDK](../evidence/engineering-results.md)、[完整检查](../evidence/final-fixed-check.txt)、[独立审阅](../evidence/engineering-review.md)记录实际结果。CI 只配置 macOS arm64；没有 push，远端未执行。CLI opt-in smoke 明确 SKIP，固定 SDK 实际行为另走 validate:sdk。工程 resolved 不代表用户认可。禁止 push 和 S5/M2。
