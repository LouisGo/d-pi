## Summary

原生等待失去失败类别、离开查询后实际I/O仍存活、附件来源随React消失、Undo资产可能被GC删除、阅读仅恢复像素、Writer接受任意字段并混淆损失。现在分别由Host task scope、Main只读operation/共享runner、Thread附件模型、Main history/clipboard lease、内容锚点与安全Writer承担。

跨Thread复制含文字/图片/动态文件/目录的选区时，Main按原项目权限在COPY准备阶段冻结实际内容与版本；目标只读私有快照、获得新ID，一个Undo/Redo处理整个片段。源修改/删除及目标同名路径不影响目标，原始动态引用仍发送时读取。正式GUI展示冻结标识与来源详情，失败/过期/超限可读降级；未采用clone的清理失败/迟到由原Thread保留实际ACK重试责任。

沿用OMP执行/历史、Main持久化、接受/消费原子事务、unknown不重发及冷恢复只读；Effect仅既定执行边界。独立研究、取舍、完整合同见[research](research.md)、[spec](spec.md)。本文件为本地可审查草稿，无远端操作。

## Evidence

固定基点598323321c8c2ba6eb177097e2042510c3b79d87，最终生产源b49c413f99ff417172a9f44b6cd124f1d222dd1f（built commit相同、dirty=false）。完整check/build退出0：174files/1010tests通过、2tests跳过。独立Spec/Standards最终无未处理高价值发现；目录.pdf的freeze及正式preview红绿闭环，普通PDF文本伪装仍拒绝，PDF原件/派生Undo/save/GC及所有旧失败恢复保持通过。逐项可取回证据和范围在[07](evidence/07-integration.md)。

真实Main/preload/Renderer/SQLite、PNG decoder、Chromium/macOS pasteboard：两个不同项目，export ready后删除源file/修改dir、目标同名冲突；真实冻结内容/版本、正式来源详情、全新目标ID、一次Undo/Redo均通过，原剪贴板restored，没有模型请求。[原始样本](evidence/electron-frozen-references-final.json)。SDK PDF验证文本抽取与既有coverage/textOnly同意，未声称OCR/页面渲染。

同负载Git active峰值24→4、排队20且输出一致，取消资源结算1.74–3.18ms、句柄回到0；阅读约104px漂移消除，固定几何相对漂移0、绝对误差0.21875px。真实PM/SQLite证明GC后Undo资源仍可用及放弃依赖回收容量，失败责任不随Editor结束丢失。Writer安全增加约0.83ms/100次采集p95成本，不宣称普遍更快。

## Merge Danger

Main/preload/Renderer须同版；SQLite schema未变，但新增optional provenance的JSON旧strict构建可能拒绝，不能描述为双向回滚兼容。新构建读旧记录已验证；若新数据已写字段，回退需兼容数据快照或明确迁移，保留原数据/原生历史，不删库或重发unknown。

GC实际删除不可逆，依据持久引用与snapshot/import/history lease在实际unlink前复核；回滚代码不能恢复已合法清理对象。来源path/version只作溯源，不授予文件访问权限。目录为完整直接清单，单源/提交/transport预算及PDF覆盖规则不放宽。

分支未push、未创建远端PR/merge/发布。工程complete与Dev交付不替代个人provider执行、远端CI、安装包或用户认可；具体Dev步骤及限制见[handoff](handoff.md)。
