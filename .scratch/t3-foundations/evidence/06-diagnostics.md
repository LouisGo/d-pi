# 06 Writer 安全与恢复证据

2026-10-07，集成基点 `598323321c8c2ba6eb177097e2042510c3b79d87`，文档契约先提交 `851d3e5`，本票由主 Agent 实施。

## 行为与红绿

- 首次有效红灯：`pnpm test src/platform/main/diagnostics/diagnostics.test.ts`。新注入的 `toJSON` 将秘密写入原始 JSONL，1 failed / 2 passed。错误的 `pnpm test -- <file>` 未启动测试，未算作红灯。采集改为只读取白名单数据属性，Zod/有限值目录先于 stringify，可信时间/构建/进程身份由 Writer 注入。
- 恢复、追加未确认、清理计数、拒收及 close deadline 的4个新行为先失败，再实现；已写+append拒绝样本明确保留 uncertain，清理失败不加 dropped。每个故障 episode 只调用一次通知 callback；成功后累计计数保留并尝试一条受控 gap，gap 失败不递归。
- 伪造 `writerGap` 的补充红灯复现合法事件被额外元数据拒收；修复为 gap 仅由 Writer 私有序列化参数注入。公开采集不接纳该字段。
- UI 新计数/最近恢复先1 failed / 10 passed，再11 passed。旧快照缺字段明确显示未提供。沿用现有布局，Impeccable context 与 harden/craft-floor 已读；机械 detector 对 diagnostics.tsx 返回 `[]`。
- 真实临时文件轮转/过期删除回归；慢追加时150条中100条在途，2s关闭后50条确认写前丢弃，首个I/O完成后不启动下一 batch；重复close共用同一promise。

最后必要组合：`pnpm test src/platform/main/diagnostics/diagnostics.test.ts src/platform/main/diagnostics/reader.test.ts src/app/main/ipc/diagnostics.test.ts src/app/preload/bridges/diagnostics.test.ts src/app/renderer/shell/diagnostics.test.ts`，5 files / 39 passed。采集秘密/任意字段/方法与可信身份测试、独立读取脱敏/坏行/预算/不等flush、Main私有导出及preload形状关联都通过。`pnpm typecheck` 全环境通过；`pnpm check:fast` 通过；生成结构报告已更新。

## 成本与收益

[可复现脚本](diagnostics-cost.mjs)在 Node 24.21.0 / darwin-arm64 上，用 Bun 1.3.14 仅做相同 target=node 转译，分别运行关闭/原基点Writer/新Writer，各5次，每次10000条相同元数据，100条一批，交替顺序，预热后计采集同步耗时。磁盘flush不计入该计时，受控flush确保不混入压力丢弃；[全部原始数值](diagnostics-cost.json)。

| 指标（5次中位） | 关闭 | 原基点 | 新Writer |
| --- | --- | --- | --- |
| 100条采集中位/ms | 0.00058 | 0.16742 | 0.75446 |
| 100条采集p95/ms | 0.00071 | 0.22383 | 1.05867 |
| 强制GC后稳定堆增量/bytes | 15904 | -4456 | 119624 |

所有样本 dropped=0。增加了约0.83ms/100条的p95采集成本，以换取源头脱敏、可信身份及准确故障口径；并非速度优化。该局部成本有界且低于单次5ms参考量级，但不能据此声称完整B6的输入p95/任务时间/原生流式GUI组合验收通过。最终集成仍需完整check/build与必要GUI观察，当前未代替用户认可。
