## Summary

把当前授权切片变成可调度的任务图，保留本地任务、决定合同与工程/试用/认可单源。具体范围见 [spec](spec.md)。

```text
授权切片 → leaf 票 + Blocked by → 只读 Ready Frontier
  → 独立 worktree 实现 → 主 Agent 串行集成
  → 现有 checks → 独立 Spec / Standards review
  → PR 或本地交接 → 有证据、受控的 retro 回流
```

根 AGENTS 现在路由执行、review、PR、retro 四个仓库 skills；CONTEXT 原样迁为 GLOSSARY，现行引用同步。计划只选票和 hold，不复制状态或推断授权。

## Evidence

- Before：Frontier 只选最小编号；无确定性切片调度，执行/review/PR/retro 缺稳定入口。After：新 CLI 列完整候选及阻塞原因，接入现有文档与看板门禁。
- 新 CLI、held/非法计划及无看板行 spec 的指纹回归均有真实 red→green；词汇表改名无行为红灯。
- `pnpm check` 与 `pnpm build` 通过；修复后19项相关行为测试及 check:fast 通过。原生 CLI smoke 为明确 SKIP；没有真实 GUI/用户认可声明。
- 验证来源与限制见 [validation](validation.md)；独立双轴结果见 [review](review.md)。实现提交：`cd198bb`，指纹修复：`748a9b5`。
- 隔离执行已跑通串行降级、claimed/held/范围外保持、本地PR/review/retro，以及同基点真实双 worker、串行集成和最新基点fan-in；主 Agent独立重跑9/9与8/8并核对最终状态。固定原始证据见 [交接](handoff.md)。
- 这是本地 PR body，尚无远端 PR/CI；实际发布时改写链接为对应已推送 source 的有效仓库链接。

## Merge Danger

**Door：two-way。** 修改开发工具与仓库规则，无 App/OMP 执行、数据库迁移或外部副作用；可 revert 本轮提交回到旧入口。GLOSSARY rename 与全部现行引用须一起回退，不能只回退一半。

**Blast radius：后续 Agent 的执行、评审与交接。** 错误规则可能影响后续任务调度；用 fail-closed 计划门禁、独立审查和隔离试跑验证。旧 spec 无计划时仍可使用原流程，不要求批量迁移全部历史规格。

**Rollback：** 回退本轮提交并重新生成看板；已在未来其他切片创建的工作分支/票和用户数据不被自动删除，按其实际状态交接。Merge 不代表 M2 工程完成、试用或用户认可。
