# T3 基础重构交接

2026-10-07。全部选定工程目标01–07已完成；用户选项1的跨Thread动态引用复制冻结已包含。集成分支`codex/t3-foundations`，固定基点`598323321c8c2ba6eb177097e2042510c3b79d87`，工作树`/Users/louistation/.codex/worktrees/t3-foundations/d-pi`。原checkout保持clean基点，4座worker已由App归档，集成树保留供试用。

完整独立结论在[research](research.md)，目标与认可状态单源在[spec](spec.md)，逐次红绿、两轴review及完整检查在[07](evidence/07-integration.md)，本地可审查[PR草稿](pr.md)。未push、创建远端PR、merge或发布。

## 当前结果与固定版本

六组结果已接入正式路径：Host原生typed failure与任务生命周期；Main只读operation和Files/Git资源取消；Thread附件来源及Undo/GC保护；可信结构化复制和原项目内容冻结；按内容/来源隔离的阅读锚点；Writer源头安全与故障恢复。沿用OMP执行/原生历史、接受与消费原子事务、unknown不重发和冷恢复只读；Effect限于既定执行边界。

最终生产源`b49c413f99ff417172a9f44b6cd124f1d222dd1f`；built Main commit同值、dirty=false、build id=`b49c413f-63f67e9e`。其后只提交文档、状态和原始证据，不改变生产代码。完整`pnpm check`/`pnpm build`退出0，174files/1010tests通过，2tests按既有条件跳过。最终独立Spec/Standards无未处理高价值问题；目录名.pdf的格式与正式预览问题已由真实反例闭环，既有迟到清理/缓存恢复/PDF派生保护保持。

真实macOS剪贴板、生产Main/preload/Renderer/SQLite/PNG decoder与Chromium证明：image+@file+@directory跨两个不同项目搬运，export ready后源file删除、dir变化和目标同名不同内容都不影响快照。目标全新ID、真实reader.version/来源时间、正式冻结标识及展开详情均核对；一次Undo/Redo整个片段、同一目标IDs，原剪贴板实际restored。原始[electron冻结样本](evidence/electron-frozen-references-final.json)可取回。未生成模型请求，临时数据和进程已清理。阅读width/Composer/view/Thread返回相对漂移0、绝对偏差0.21875px。

## Dev 试用

```sh
cd /Users/louistation/.codex/worktrees/t3-foundations/d-pi
pnpm dev
```

1. 在项目A的Thread加入@文件、@目录和图片，选择一段文字/引用复制，在不同项目B的Thread粘贴。目标显示“复制时冻结”，展开查看原项目、路径、版本与捕获时间。目标ready后修改/删除A来源，B预览继续显示原内容；目录只含直接条目清单。原始A动态引用仍按发送时读取，自动化已验证其读取新版本。
2. 对复制片段做一次Undo、Redo，核对整段共同移除/恢复。删除附件并保存、打开附件存储清理，再Undo，内容仍可准备。原件和PDF派生同样保护；覆盖缺口仍需原有明确textOnly同意。
3. 阅读历史/对话中间位置，改变窗口宽度、隐藏/展开Composer、切换view或A→B→A，应回到同内容条目。native session/page与live generation按真实来源隔离。
4. 快速切换Files/Changes资源并返回，旧读取消、结果不串资源；共享Query仍有observer时继续服务。Git活跃/排队有界，机器输出不完整或防护失败明确失败。
5. 诊断中区分当前退化、历史拒收/丢弃/追加未确认与留存失败。历史额度或必要清理失败出现时按明确提示清史/重试；不要通过重载掩盖失败。正常第十Thread等待释放后自动恢复，真实失败保持同IDs重试。

剪贴板ticket有效120秒，过期/跨App实例/准备失败会明确可读降级；已成功粘贴采用的私有内容不再依赖源项目路径。冻结发生在Main的有界异步COPY准备阶段，ready后不可变，不声称OS按键瞬间的磁盘快照。新增optional provenance让新构建继续读旧记录，但旧strict构建可能拒绝新字段；同版Main/preload/Renderer，未提供降级数据迁移。

Dev App数据按checkout路径隔离，终端显示实际目录；OMP配置及认证沿既有解析，App隔离不等于OMP配置/会话隔离。自动化使用独立配置、SQLite及离线fixture，没有账户/provider执行。

## 收益、限制与继续

固定Git负载active峰值24→4、排队20且输出一致，取消结算1.74–3.18ms（原自然结束约286–297ms）；真实文件句柄回到0。阅读原约104px漂移消除。真实PM/Main/SQLite证明GC后仍能Undo/prepare、已放弃依赖可回收容量、必要失败责任跨reset/eviction/adapter卸载保留，见[02](evidence/02-reads.md)、[03](evidence/03-input.md)、[04恢复](evidence/04-clipboard-recovery.md)。跨项目冻结新增源删除/目标冲突后内容与版本稳定的可核验收益，实际原件/派生64MiB与全局128MiB预算、TTL、失败回收及旧记录见[04冻结](evidence/04-frozen-references.md)。

Writer原始字节安全及故障口径正确；固定100次采集p95成本增加约0.83ms，未宣称所有路径更快。GC单批受扫描预算限制，额度与物理回收以完整有界续扫共同核对；只验证了存活Thread的adapter/Editor卸载/重挂责任，不把任意ThreadModel.dispose等同Main document释放。

真实SDK18.4.6/Bun1.3.14 PDF文本抽取、实际coverage与textOnly同意已验证；页面渲染、图表保真、OCR识别及任意PDF全集未验证。两项默认opt-in/platform跳过不算通过；本轮没有个人账户/provider执行、远端CI、安装包、发布或用户认可证据。工程complete、trial delivered、acceptance pending。继续时读spec与本交接，围绕实际试用反馈推进；本轮没有遗留产品选择或未完成工程票。
