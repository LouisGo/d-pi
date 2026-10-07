## Summary

本地 T3 基础重构。原生等待缺少可靠的失败分类、查询离开后仍持有真实读取资源、附件来源随 React 生命周期消失、撤销历史未保护私有资产、阅读只记像素、Writer 在源头接受任意字段并混淆故障损失。

现在这些行为分别归 Host、Main 只读 operation、Thread 附件模型、Main history/clipboard lease、Thread 内容锚点和 Main Writer。保留 OMP 执行与历史、接受/消费事务、unknown 不重发和冷恢复只读，Effect 限于已确认的执行边界。研究、合同和范围见 [research](research.md)、[spec](spec.md) 与七张本地票。

跨 Thread 私有图片和冻结选区采用Main可信handle、新目标ID与一次Undo/Redo；未持久clone在正文/历史接棒后有界回收，必要清理失败及迟到结果由原Thread保留重试责任。正常历史释放在途自动恢复，React快照稳定。用户已选择动态文件/目录复制时冻结来源与版本，原动态引用仍发送时读取；剩余冻结实现和验证进行中，04/07尚未整体结算。本文件是本地可审查草稿。

## Evidence

固定基点 `598323321c8c2ba6eb177097e2042510c3b79d87`，分支 `codex/t3-foundations`；最终工程输入、组合检查及独立 Spec/Standards 结论见 [07](evidence/07-integration.md)。每个目标的真实失败、回归与限制分别保存在 [01](evidence/01-native.md)、[02](evidence/02-reads.md)、[03](evidence/03-input.md)、[05](evidence/05-reading.md)、[06](evidence/06-diagnostics.md)。

生产源 `477b85459a4e779044ec499c684b5047e31f9b14` 的build通过；仅看板哈希更新后的0a7e9a5完整check退出0（172files/989tests通过，2tests跳过）。两轴已关闭全部已证实P2，最终增量Spec 4files/40tests、Standards 4files/19tests通过，未发现新高价值问题。真实macOS剪贴板/目标新ID/一次Undo及Redo和阅读锚点复核通过，原剪贴板已恢复；未执行model请求。

真实 Git 负载下 active child 峰值24→4，排队20且输出一致；取消后资源结算约1.74–3.18ms，原自然结束约286–297ms。真实文件句柄回到0。实际 PM/SQLite 的删除→保存→clean→Undo 能重新准备原资源，同 ID PDF 新派生摘要也保护。真实 Electron 宽度变化、Composer 隐藏、视图/Thread 返回保持同内容条目偏移，原像素恢复约104px漂移，现约0.22px绝对误差。

Writer 的原始落盘和读出过滤独立防护、故障统计/恢复正确；固定100次采集批次 p95 增约0.83ms，是安全成本，未宣称普遍性能提升。真实 SDK/provider/登录、发布包、用户体验认可与 fixture/Agent 检查分别记录；本轮未执行远端 CI 或发布。

## Merge Danger

代码与wire合同改变，SQLite schema未改变；Renderer/Main/preload要使用同一构建。新增冻结来源为optional JSON字段，新构建继续读旧记录，旧strict schema可能拒绝新字段，不能将schema未迁移描述为双向回滚兼容。影响链包括Host等待、只读取消、附件导入/保存/清理/撤销、阅读布局和诊断。GC是不可逆的实际文件删除，必须依据持久引用和瞬态lease在实际unlink前复核；回滚代码不能恢复已经合法清理的对象。history/clipboard lease为进程内临时权限，溯源路径和版本不授予读取权限。

回退先退出新构建并保留App数据和原生历史；若已写入冻结字段，旧构建不能直接沿用该数据副本，需使用回退前留存的兼容数据快照或实现明确迁移。不要删库或重发unknown。已写且安全过滤的诊断历史继续按原格式读取。分支尚未push，未创建远端PR、merge或发布；工程检查不替代试用和用户认可。
