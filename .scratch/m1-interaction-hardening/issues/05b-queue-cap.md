# 05b 队列上限 20 与输入禁用

Status: resolved

2026-09-28。用户决定：上限 20 条，达限提示上限并禁用输入框，有空位恢复。

## 交付

- `src/features/runtime/submission-admission.ts`（或同目录新模块）：新增 `QUEUE_CAP = 20` 与 `queueCount(receipts, queueLength)`（仅 prepared/dispatching 收据 + 原生队列条数，近似口径如实注释）、`queueCapped(...)`；单测覆盖计数与边界。`canSubmit` 语义不变。
- `src/main/runtime-service.ts` + `src/features/submission/contracts.ts` + `coordinator.ts`：达限时 prepare/dispatch/resend 走新增 `queue-full` 失败码（中文 safeMessage 提示上限与原文保留），Renderer 照常显示。
- `src/renderer/composer.tsx`：`SendButton` 订阅收据与运行时视图，达限时禁用发送/干预按钮并显示“排队已满（20/20），请等待消费后再发送”。
- 先红后绿：计数单测、Main 达限失败集成单测（`runtime-service.test.ts` 或 coordinator 层）。

## 验证

- 受影响 vitest + 全量 `pnpm check`（随本批提交）。
