## Summary

原生等待失去失败类别、离开查询后实际I/O仍存活、附件来源随React消失、Undo资产可能被GC删除、阅读仅恢复像素、Writer接受任意字段并混淆损失。现在分别由Host task scope、Main只读operation/共享runner、Thread附件模型、Main history/clipboard lease、内容锚点与安全Writer承担。

跨Thread复制含文字/图片/动态文件/目录的选区时，Main按原项目权限在COPY准备阶段冻结实际内容与版本；目标只读私有快照、获得新ID，一个Undo/Redo处理整个片段。源修改/删除及目标同名路径不影响目标，原始动态引用仍发送时读取。正式GUI展示冻结标识与来源详情，失败/过期/超限可读降级；未采用clone的清理失败/迟到由原Thread保留实际ACK重试责任。

沿用OMP执行/历史、Main持久化、接受/消费原子事务、unknown不重发及冷恢复只读；Effect仅既定执行边界。独立研究、取舍、完整合同见[research](research.md)、[spec](spec.md)。本地PR已按授权合入main，包含复盘提交34c65d0；main原有终端B与选择组件结果保留。实际基点、组合源码和合并证据见[本地集成](local-main-integration.md)，无远端操作。

## Evidence

本地合入前main为a47feec9d2cf4533ca57fa6effcb3d64903c083a，最终组合源码a20a9c2246b35ca1ee3241015e0e2b8f7956606b；完整check/build退出0：174files/1011tests通过、2tests跳过，architecture425。新两轴刷新无未处理高价值发现。真实公共Select事件回归验证native session/page/segment的A→B→A恢复，相关4files/21tests通过；额外变更只有必要import/export排序和生成报告。隔离SDK避免争用运行中Dev的资源锁，没有更改产品或绕过守卫。

历史开发基点5983233、T3生产源b49c413（built commit相同、dirty=false）的完整check/build为174files/1010tests通过、2tests跳过。目录.pdf的freeze及正式preview红绿闭环，普通PDF文本伪装仍拒绝，PDF原件/派生Undo/save/GC及旧失败恢复证据在[07](evidence/07-integration.md)。下方原生JSON仍标识b49c413，未在新的组合构建重录。

真实Main/preload/Renderer/SQLite、PNG decoder、Chromium/macOS pasteboard：两个不同项目，export ready后删除源file/修改dir、目标同名冲突；真实冻结内容/版本、正式来源详情、全新目标ID、一次Undo/Redo均通过，原剪贴板restored，没有模型请求。[原始样本](evidence/electron-frozen-references-final.json)。SDK PDF验证文本抽取与既有coverage/textOnly同意，未声称OCR/页面渲染。

同负载Git active峰值24→4、排队20且输出一致，取消资源结算1.74–3.18ms、句柄回到0；阅读约104px漂移消除，固定几何相对漂移0、绝对误差0.21875px。真实PM/SQLite证明GC后Undo资源仍可用及放弃依赖回收容量，失败责任不随Editor结束丢失。Writer安全增加约0.83ms/100次采集p95成本，不宣称普遍更快。

## Merge Danger

Main/preload/Renderer须同版；SQLite schema未变，但新增optional provenance的JSON旧strict构建可能拒绝，不能描述为双向回滚兼容。新构建读旧记录已验证；若新数据已写字段，回退需兼容数据快照或明确迁移，保留原数据/原生历史，不删库或重发unknown。

GC实际删除不可逆，依据持久引用与snapshot/import/history lease在实际unlink前复核；回滚代码不能恢复已合法清理对象。来源path/version只作溯源，不授予文件访问权限。目录为完整直接清单，单源/提交/transport预算及PDF覆盖规则不放宽。

仅本地main合入，未push、创建远端PR或发布。工程complete与Dev交付不替代个人provider执行、远端CI、安装包或用户认可；具体Dev步骤及限制见[handoff](handoff.md)。
