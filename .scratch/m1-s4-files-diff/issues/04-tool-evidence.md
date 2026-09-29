Status: resolved

# 原生工具证据

M1。D-20/D-22。从原生会话读取关联 toolCallId 的工具结果；明确成功/失败、来源和截断。无可靠前后内容时不画操作 Diff，不用当前 Git 状态倒推工具改动。

## Answer

原生 v3 历史在已有只读读取中保留 `toolCallId`、`toolName`、`isError` 和文字/非文字覆盖；有证据的 write 类工具显示原生结果，但不生成缺前文的工具 Diff。测试验证记录字段与非文字部分计数。真实原生样本仍需用户试用确认显示效果；不把 shell 或工作区其他变化归为工具修改。

2026-09-29 夯实：补 `isError` 成功/失败/缺失三态、非写工具与无工具身份不生成证据单测；文件修改类名单为本地启发式（`write/edit/delete/apply_patch/ast_edit`，随 OMP SDK `18.3.0` 演进需复核），未命中按中性文案展示，实现不变。
