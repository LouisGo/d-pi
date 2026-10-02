# M2 队列与后续子 Agent 切片交接

本页为 m2.11 历史快照。2026-10-02 独立review确认两项队列P2并修复，当前试用候选已由 [m2.12 审查交付](queue-configuration-review.md#修复候选与试用)替代；原证据保留。

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

## 最终候选与试用

- 干净源码：`0d45db98530e443b33ebb253659ec41610f6e46f`；产品实现提交`2d488d5`，随后验证fixture收口`0d45db9`。版本/构建：`0.1.0-m2.11 / 0d45db98-54e50919`，dirty=false。
- App：`dist/queue-subagent-m2.11-clean/mac-arm64/d-pi.app`。
- ZIP：`dist/candidates/d-pi-0.1.0-m2.11-0d45db9-mac-arm64.zip`；ZIP CRC与内部app.asar同源核对通过。[SHA-256与身份](evidence/next-stage-candidate.json)。
- [完整工程检查](evidence/next-stage-check.txt)、[实际包结果](evidence/next-stage-package-result.json)、[包内日志](evidence/next-stage-packaged.txt)、[构建](evidence/next-stage-build.txt)、[打包](evidence/next-stage-pack.txt)。

最终实际macOS包通过16项检查：当前执行保持时set/clear后续子Agent默认；可信Input.insertText编辑原生队列/save/delete，SQLite旧原文/变更命令/ACK与冻结提交同时保留；全过程无额外模型请求。另覆盖原有双Thread原生执行、模型/档位/草稿隔离、阅读与DOM连续性、Undo/Redo、代表性Chromium composition、Renderer刷新无重发、旧Thread冷只读及新独立Thread出口。仅2次localhost模型请求，无真实凭据/费用；不冒称系统输入法全矩阵、真实红色关窗编辑保留或全集性能验收。GUI/SDK/集成测试证据各有边界。

截图已核对：[编辑](evidence/next-stage-m2-queue-edit.png)、[并行会话](evidence/next-stage-m2-parallel-entry.png)。默认1120×780窗口：Composer/发送在窗口内，阅读区169px，上部设置控件可独立滚动。包内导航stderr保留了旧历史查询被`Invalid history source`来源守卫拒绝及Electron旧frame警告，与既有场景一致，不宣称零报错。

试用：解压后确认左下角构建`0d45db98-54e50919`。使用可信新Thread，在执行期间排队发送纯文本，展开“待处理队列”进入编辑、保存/取消、删除/重排；观察原生队列，不自动重试unknown。展开“子Agent设置”应用或清除覆盖，验证随后spawn与其它Thread隔离。原有旧Thread仍只读。

本轮切片工程/候选已完成，M2总体仍in-progress；trial delivered、acceptance pending。后续继续04附件/引用准备与父05其余能力、组合体验复试；冷执行恢复不能绕过D-24，复制历史语义另行对齐。原有环境对齐未提交改动完整保留；本轮只本地commit，未push。
