## Summary

为本地 [flow 规格](spec.md) 交付 [02a](issues/02a-normalize.md)、[03](issues/03-label.md)、[04](issues/04-compose.md)：新增 `normalizeId` 和 `stateLabel`，由 `describeTicket` 组合为如 `02a: 待执行` 的描述，原 `echoId` 行为保留。非法标识、空白标识及未知状态抛 `TypeError`。

集成分支 `codex/flow`；baseline `d7e3298977e37fbf79e4cd0cd75f66be2877f7b7`，实现 source commit `adce69e5bb9499562e90d64549913d9da248f250`。05 仍由活跃 worker claimed，06 仍 held，07 范围外，flow 工程状态 partial；试用和用户认可不适用。

## Evidence

Before：只有 `echoId`，标识/状态模块不存在，组合 export 不存在。After：精确修剪和状态映射，组合消费公共函数，原身份函数不修剪。三票均先运行测试得到真实缺目标失败，再最小实现通过；[02a red](evidence/02a-red.log) / [green](evidence/02a-green.log)、[03 red](evidence/03-red.log) / [green](evidence/03-green.log)、[04 red](evidence/04-red.log) / [green](evidence/04-green.log)。

最终 [npm test](evidence/final-test.log) 与 [npm run check](evidence/final-check.log) 均 exit 0、9/9，Node v24.21.0。[状态检查](evidence/final-status.log) 通过，[frontier](evidence/final-frontier.log) 无 ready、05 claimed、06 held。固定整段 diff 与两轴 review 见 [review](review.md)。

验证仅限纯 Node fixture，没有 SDK、App、GUI、供应商、远端 CI 或用户试用。首次 npm 未隔离配置并输出 user config 警告；后续配置解析失败和最终隔离命令结果均保留在 [retro 候选](retro-candidates.md)，该环境命令错误没有记作行为红灯。无 push 或远端 PR。

## Merge Danger

Door：two-way，本次只添加本地模块、测试和任务证据，无数据迁移、权限、资源或外部服务变化。影响链为 `describeTicket → normalizeId / stateLabel`；原 `echoId` 原样保留。

回滚可按票逆序 revert 实现提交 `adce69e`、`964b375`、`878dd23`，同时将相应工程票重新打开、同步依赖状态并重新生成看板；不能用 revert 日志文件改写历史证据。本次无已发生的外部效果。合入不代表试用或用户认可。
