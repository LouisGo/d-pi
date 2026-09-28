# 02 close-idle 非 SDK 路径对齐

Status: resolved

2026-09-28。基线 `c97ee19`。对应审计 C11。S3 现均为 sdkEntry 路径；本票只补非 SDK 路径的最后已知活动检查，不改 `HostStart.sdkEntry` 可选契约。

## 交付

- `src/host/session-host.ts`：记住最后一次 `d_pi_control_state` 控制状态；`close-idle` 在无新鲜查询时，若最后已知 streaming/compacting/stopping/queued/background/pendingAsync/admitted 任一成立，同样回 `failed active-work` 并刷新上报，不直接关闭原生进程。
- `src/host/session-host.test.ts`：先红后绿覆盖“被动控制帧报告后台活动后，非 SDK close-idle 拒绝关闭”；既有“纯空闲关闭成功”继续通过。

## 验证

- `pnpm exec vitest run src/host/session-host.test.ts`
- 全量 `pnpm check` 在 06 票汇总。
