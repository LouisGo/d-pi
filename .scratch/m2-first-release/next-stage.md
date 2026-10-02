# M2 队列与后续子 Agent 切片交接

2026-10-02，起点 `a338162`。用户授权合理角色与数量的 subagent 并行推进下一阶段，并明确恢复中断工作。本轮 3 个 subagent 分别负责原生队列、原生子 Agent 配置与冷恢复证据/GUI，主 Agent 整合公共协议、Main 持久化、Host/Renderer接线与候选。

## 结果与范围

- [05a](issues/05a-native-queue-management.md)：真实待处理项身份、纯文本编辑暂缓/草稿/保存/取消、删除/同类排序；原生模式保留，all 批次含编辑项时整批等待。附件/custom 暂不编辑，不标完整父05完成。
- [05b](issues/05b-thread-subagent-configuration.md)：当前 Thread 后续 spawn 的原生实例默认模型/档位，set/clear/回读与GUI；不改共享配置、主模型或已启动实例，保留显式请求原生优先级。
- [06a](issues/06a-cold-continuity-evidence.md)：固定SDK18.4.6双进程反例证明文件publish锁不能保证执行全周期单写。旧Thread仍只读；复制历史到关联新Thread语义需产品对齐。

Main 的schema7 queue_change在派发前保存命令/旧文本、真实原生目标与trace；未知结果不自动重发，显式fresh inspect核对后才允许新的明确操作。截短投影记录 previousTruncated；冻结提交和旧收据保留。恢复顺序为原提交恢复、迁移备份/升级、queue recovery、发布。

## 分层证据

[队列记录](queue-management.md)、[子Agent记录](subagent-configuration.md)、[冷恢复证据](../m2-cold-continuity-boundary/research.md)。真实SDK队列8次localhost请求及子Agent9项行为，GUI挂载与Main/Host/SQLite集成分别证明对应边界，不能混为真实个人供应商或产品认可。

整合进一步修复：错代/错operation不能确认相同trace；子Agent读取失败不能标已核对；pending控制保活；await目录身份后重验并发门控；队列摘要截短不降低20项准入上限。实现缺口均以真实失败回归后转绿；原正确路径补测不制造红灯。

## 交付状态

当前工作区 `pnpm check` 通过：591 项行为测试、34 项架构、59 项工具测试，1 项既有 CLI artifact opt-in 跳过；全部类型/设计/i18n/结构/文档/状态门禁通过。工作区使用已存在的环境对齐修复，保持其未提交，不借此声称原始工具文件亦通过同一环境。干净源码构建、实际macOS候选验证与精确身份待下方补齐。M2仍in-progress，用户认可pending；不push，不公开发布。原有环境对齐改动保持未提交。

首轮包内核对未通过（候选未交付）：临时build checkout的顶层依赖软链接没有匹配仅目录的ignore，构建身份dirty=true；改用普通ignored依赖目录/实际克隆SDK再构建。队列输入fixture的CDP Meta+A未触发平台selectAll，实际插入在旧文前；这不是原生保存缺陷，改为明确DOM全选后trusted Input.insertText，保持正文精确断言。失败记录保留，后续同场景重新验证。
