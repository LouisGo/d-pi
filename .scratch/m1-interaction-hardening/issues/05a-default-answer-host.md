# 05a 主机超时默认作答

Status: resolved

2026-09-28。用户决定：confirm 永不超时（必须卡住）；select 取首选项、input/editor 取预填值、无预填则取消；原生无超时字段时 App 等 120 秒（原生给了就按原生的，须抢在原生删除前写出）；默认发出后用户再答转为追发指示（05c）。

## 交付

- `src/features/control/interactions.ts`：`InteractionSchema` 加可选 `defaultAnswered` 标识；新增纯函数 `defaultAnswerFor(dialog): Answer | null`（confirm→null，其余按用户决定），单测覆盖四类方法与缺选项/预填边界。
- `src/host/interactions.ts`：新增 `markDefaultAnswered(id)`（仅 sent 状态可标记并通知变更）。
- `src/host/session-host.ts`：新增默认作答调度器（`setTimeout` + `unref`，上限 120000ms）：observe 后对新增 pending 非 confirm 对话框按 `min(expiresAt ?? ∞, now+120s)` 排期；到期仍 pending 则用 `defaultAnswerFor` 写出、发布交互视图、标记默认、发送 operation-result、刷新；用户已答/取消/过期/断链/关闭时排期作废。confirm 从不排期。
- `src/host/session-host.test.ts`：先红后绿覆盖 select 超时默认写出首选项、confirm 超时无写出、用户先答后排期作废、原生短超时抢先写出。

## 验证

- `pnpm exec vitest run src/features/control src/host/interactions.test.ts src/host/session-host.test.ts`
- 全量 `pnpm check` 在 06 票汇总（06 已 resolved，复开随本批提交更新）。
