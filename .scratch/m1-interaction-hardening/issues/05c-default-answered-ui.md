# 05c 默认作答标识与超时后追发

Status: resolved

2026-09-28。用户决定：问答卡片标识已默认采取的选项；浮窗不关闭；默认发出后用户再答转为新的追发指示（原生只认第一次回答，决定登记已记录约束）。

## 交付

- `src/features/submission/model.ts`：新增 `sendText(text, delivery="followUp")`，不经草稿捕获（`captured` 保持空，ACK 不清稿）、走既有 prepare/dispatch 与命令策略；单测覆盖草稿不受影响与策略拒绝。
- `src/renderer/runtime-panel.tsx` + `src/renderer/app.tsx`：默认已作答对话框留在活动区，显示“已按默认作答：X（超时 120 秒），你仍可继续作答，将作为新的追发消息送达”；提供继续作答入口，经 `App → model.submission.sendText` 发出。`NativeDialog` 既有 sent 不可逆语义保留给用户主动回答。
- GUI 接线以类型检查 + 试用验收为准（纯函数部分已有单测），试用步骤见 06 票更新。

## 验证

- `sendText` 单测 + `pnpm check` + 试用（触发 select 超时→默认→继续作答）。
