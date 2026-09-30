# 02 文档与总看板

Status: resolved
Blocked by: none

范围与授权见 [spec](../spec.md)。稳定入口、决定索引及来源聚合；非法状态/依赖/陈旧输出先失败测试。

## 验收

AGENTS 只保留稳定规则与路由；当前授权/试用回到规格。[决定登记](../../../docs/decisions.md)保留全部 46 个 D/B/P ID、理由及引用，旧实施叙述保存在[原文快照](../evidence/decision-history.md)，只重定位相对链接，不改证据含义。

[固定总看板](../../../docs/status.md)从规格的少量 `project-status` 字段及任务 `Status` / `Blocked by` 聚合；共享读取器拒绝非法状态、重复 ID、不存在/循环依赖及已解决票依赖未解决票。生成器校验字段、证据/待决入口、试用与认可区分，并对完整状态源内容检查新鲜度。没有建立第二份手工进度或强制全仓 frontmatter；一处 `done` 已改为标准 `resolved`，未确认的历史候选保留。

[状态红灯](../evidence/status-red.txt)、[状态绿灯](../evidence/status-green.txt)、[看板红灯](../evidence/board-red.txt)、[看板绿灯](../evidence/board-green.txt)记录新增目标缺口；最终固定工具链的全量检查和冻结审阅由 [05](05-verification.md)整合。工程 resolved 不代表用户认可。禁止 push 和 S5/M2。
