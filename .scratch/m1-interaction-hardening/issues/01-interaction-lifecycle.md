# 01 交互生命周期收敛

Status: resolved

2026-09-28。基线 `c97ee19`。对应审计 B1/B2/B3。S3 语义不变：回答写出失败与断链保留 unknown，不自动重答；Main 侧 unknown 条目继续保守阻止退出。

## 交付

- `src/host/interactions.ts`：
  - `answer()` 写出抛错时删除该 id 的待答标记，状态保持 unknown（现有“第二次回答仍拒绝”断言不变）。
  - `host_tool_cancel`/`host_uri_cancel` 到达时把对应对话框置 cancelled、清定时器并通知变更；快照不再长期返回 pending。
  - `disconnect()` 把转为 unknown 的对话框从待答标记中移除；overflow 语义不变。
- `src/host/interactions.test.ts`：先红后绿覆盖写失败后 pending 收敛、取消后快照为 cancelled 且 pending 收敛、断链后 pending 收敛且快照为 unknown。

## 验证

- `pnpm exec vitest run src/host/interactions.test.ts`
- 全量 `pnpm check`（类型/Biome/设计 lint/边界/测试）在 06 票汇总。
