# 04 Compose description
Status: resolved
Blocked by: 02a, 03
Add describeTicket({id,status}) to src/index.mjs consuming normalizeId and stateLabel; returns trimmed-id + colon-space + Chinese label. Preserve echoId. Tests owned in tests/describe.test.mjs.

## Comments

2026-10-06：从已集成 02a/03 的 `d53a1d248f562bb1a31cd197e9e2371ccf442168` 启动，工作提交 `0d0ee136e77fc2d5d6e1e24793b5a6acf228ae45`，仅写 `src/index.mjs` 和 `tests/describe.test.mjs`，已串行集成为 `adce69e5bb9499562e90d64549913d9da248f250`。先因缺少 describeTicket export 失败；随后 3 个目标测试通过，覆盖精确组合、非法标识/状态拒绝及 echoId 原样返回。最终 `npm test` / `npm run check` 均 exit 0、9/9 通过。原始证据：[red](../evidence/04-red.log)、[green](../evidence/04-green.log)、[final test](../evidence/final-test.log)、[final check](../evidence/final-check.log)。源码直接消费两个公共函数，未复制其合同。纯 Node fixture，无 SDK/GUI 验收。
