# T3 基础重构交接

2026-10-07。集成分支 `codex/t3-foundations`，固定基点 `598323321c8c2ba6eb177097e2042510c3b79d87`，工作树 `/Users/louistation/.codex/worktrees/t3-foundations/d-pi`。原 checkout 保持不变。

完整研究结论在 [research](research.md)，产品选择和工程状态单源在 [spec](spec.md)，最终检查及两轴 review 在 [07](evidence/07-integration.md)。本地可审查 [PR 草稿](pr.md) 未 push/创建远端 PR。

## 当前可试用范围

原生 typed failure 与 Host 任务生命周期、Files/Git 只读取消及共享资源预算、Thread 附件来源、编辑撤销/GC 资产保护、阅读内容锚点、诊断 Writer 源头安全及故障恢复。结构化剪贴板可搬运私有图片与冻结选区，目标新 ID、一次 Undo/Redo；原动态引用跨 Thread 复制暂时显示可读降级。

最终生产源冻结 `477b85459a4e779044ec499c684b5047e31f9b14`；后续提交只更新文档/状态和证据。01/02/03/05/06与04独立范围工程完成：完整 `pnpm check` 退出0，172files/989tests通过、2tests按既有条件跳过；`pnpm build`通过。两轴独立复核已关闭全部已证实问题，包括PDF同ID新摘要保护、clone额度回收、失败cleanup跨reset/eviction、迟到discard及第十Thread React快照，没有未处理高价值问题。真实生产Main/preload/Renderer、Chromium与macOS pasteboard证明跨Thread私有图片复制、目标新ID/相同digest、一次Undo/Redo；原剪贴板实际恢复。真实阅读样本相对漂移0、绝对偏差0.21875px。

2026-10-07后续：用户已选择选项1，复制时冻结来源与版本，已登记D-10补充并解除hold。此交接的477b854仍是原独立范围的已交付快照；冻结引用从d6c9654隔离实施，最新状态看spec，04/07待新实现及评审/验证完成后结算。已有范围继续可试用，不以选择或Agent检查替代用户认可。

## Dev 试用

```sh
cd /Users/louistation/.codex/worktrees/t3-foundations/d-pi
pnpm dev
```

1. 附件与 Undo：导入图片/PDF，删除并保存，打开附件存储清理，再 Undo，内容仍能准备发送。PDF 转换失败后成功重试的同 ID 也受保护。若明确提示撤销历史预算，查看提示，只有选择“清除撤销历史并重试”才释放 Undo；正文保持。正常切换到第十Thread可等待历史释放后自动恢复；必要清理失败只提供重试，确认之前阻止保存/发送，不伪装ready。
2. 跨 Thread 复制：复制含文字、私有图片或已冻结选区的输入，切至另一 Thread 粘贴，一次 Undo 移除本次粘贴，Redo 恢复同一目标附件。过期或无有效 App handle 的剪贴板明确降级；动态 @引用当前不会读取目标项目同名文件。
3. 阅读：在历史/对话中滚到中间，调节窗口宽度、隐藏/展开 Composer、切换阅读页或 A→B→A，回到同内容条目。live generation 与 native session/page 分别记录，不靠文本猜合并。
4. 读取：快速更换 Files/Changes 资源并返回，内容归原资源；旧请求取消且 shared Query 仍有 observer 时继续服务。Git shared active/queue 有界，明确失败不解析部分输出。
5. 诊断：打开诊断，核对当前退化、历史拒收/丢弃/追加未确认与留存失败分开显示。原始秘密/路径/业务全文不作为诊断属性写入。

Dev 的 App 数据按 checkout 路径隔离，终端显示实际目录；OMP 配置及认证仍沿用现有解析策略，App 数据隔离不等于 OMP 配置/会话隔离，见 README。本轮自动化边界验证使用单独临时配置、SQLite 和离线 fixture，无执行请求。自动化准备成功不等于真实供应商执行通过。用户试用和明确认可均仍待反馈。

实际正向收益与代价：[02](evidence/02-reads.md)固定Git负载active峰值24→4、排队20且输出一致，取消结算1.74–3.18ms；[05](evidence/05-reading.md)固定几何样本原约104px漂移消除；[03](evidence/03-input.md)及[04恢复](evidence/04-clipboard-recovery.md)证明GC后Undo资产可读、放弃依赖能回收容量、失败恢复不丢清理责任。Writer原始字节安全与故障口径正确，固定100次采集的p95增约0.83ms，是安全成本，未宣称所有路径更快。

验证限制：两项默认opt-in/platform跳过未算通过；没有真实账户、provider执行、实际OS PDF转换器、远端CI、安装包或用户认可证据。GC单批结果受扫描预算影响，最终128clone审查使用完整有界续扫证明物理回收。Thread存活时adapter/Editor卸载的责任已验证，不把任何ThreadModel.dispose都等同Main document释放。只剩集成工作树供试用及继续，三座已集成worker工作树已由App归档，可恢复。

## 再继续时

先读spec推进与交接，沿已确认的选项1继续04冻结引用并刷新受影响检查、最终独立评审和组合验证；不重复询问已经收到的产品选择。保留Main/Host/OMP所有权、unknown不重发及冷恢复只读，目标只读私有快照，不打开跨项目读取权限。
