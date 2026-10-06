# Ticket description tool

## 推进与交接
Current authorized slice: ready leaf tickets in flow. Implement their behavior and integration locally; preserve existing echoId. Local commits/worktrees are authorized, no remote actions. 05 is claimed by a worker that is still active; do not reclaim it. 06 needs a live-service product answer and stays held. 07 is outside this slice. Pure engineering, trial/acceptance not applicable.

### 2026-10-06 实施记录

集成分支 `codex/flow`，固定 base `d7e3298977e37fbf79e4cd0cd75f66be2877f7b7`。管理状态由 `/root/forward_test` 单写。4 个并发槽均在使用，按 ready frontier 串行实现和本地两轴 review，不重复派发正在运行的 05。

| 票 | 执行者 / 模式 | 独立 worktree | 分支 | 启动 integration SHA |
| --- | --- | --- | --- | --- |
| 02a | `/root/forward_test` / 串行 | `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-workflow-forward-w8bbc4q1-wt-02a` | `codex/flow-02a` | `d7e3298977e37fbf79e4cd0cd75f66be2877f7b7` |
| 03 | `/root/forward_test` / 串行 | `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-workflow-forward-w8bbc4q1-wt-03` | `codex/flow-03` | `d7e3298977e37fbf79e4cd0cd75f66be2877f7b7` |
| 04 | `/root/forward_test` / 串行 | `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-workflow-forward-w8bbc4q1-wt-04` | `codex/flow-04` | `d53a1d248f562bb1a31cd197e9e2371ccf442168` |

当前交付目标为 `normalizeId`、`stateLabel` 及依赖完成后的 `describeTicket`；先记录真实失败，再以通过测试和组合 review 验收。05 保留 claimed，06 的 live-service 产品问题未回答，07 范围外；这些边界不阻塞独立工程票。

02a 已从 `73e16ec606f9bd55f403090d9d9364583ce11adc` 集成：3 个目标行为测试和含 echoId 的 4 个集成测试通过。证据见 [02a 票](issues/02a-normalize.md)。03 继续按原固定基点实现，04 仍依赖 03。

03 已从 `4edc7871e483f75fa3fb2608e25c0e16e021787d` 集成：2 个目标测试和 6 个集成测试通过。证据见 [03 票](issues/03-label.md)。重算 frontier 后仅 04 可领取；从最新集成点启动。

04 已集成为 `adce69e5bb9499562e90d64549913d9da248f250`：`describeTicket({id:" 02a ",status:"open"})` 返回 `02a: 待执行`，两个公共函数仍拥有各自验证；echoId 不变。最终 `npm test` / `npm run check` 均 9/9，exit 0，Node `v24.21.0`。02a/03/04 工程验收完成；flow 仍有 active 的 05 和 held 的 06，整体为 partial，试用/用户认可均 not-applicable。最终 frontier 无 ready，05 claimed，06 held，不重复领取也不空转。

工具证据说明：首次 npm 调用未隔离配置，npm 输出 user config 警告，表明调用读取了个人配置；这与本轮不访问个人全局配置的执行限制不一致。没有读取配置正文或访问账号，测试完成后有关闭延迟，最终 exit 0。一次隔离配置重试误将 user/global 都指向 `/dev/null`，在运行测试前失败，保留 [失败日志](evidence/02a-integration-isolated.log)。最终两个 npm 命令将 user/global/cache 指向本 fixture 的不同路径并关闭 update notifier；未安装依赖或访问账号。该命令错误不作为行为红灯。

02a/03/04 的临时 worktree 已检查为干净，`git cherry codex/flow <worker-branch>` 均仅输出 `-` 对应工作提交，证明补丁已集成；移除 checkout，保留各工作分支和全部证据，可按记录 commit 恢复。

```implementation-plan
[{"id":"flow","tickets":["02a","03","04","05","06"],"hold":{"06":"live-service product answer pending"}}]
```

```project-status
[{"id":"fixture","title":"Ticket description","phase":"基建","engineering":"partial","trial":"not-applicable","acceptance":"not-applicable","current":true,"build":"adce69e5bb9499562e90d64549913d9da248f250","next":"05 active worker; 06 held for product answer"}]
```
