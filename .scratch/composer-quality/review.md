# Composer 独立双轴评审

基点及实际merge-base `a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`；行为实现最终 `3b932e04f93d49d62e98dffc7cdcab5c18bdb5d1`。两个只读独立subagent按固定提交/临时git archive源码审查，未写项目或治理状态。主Agent核实反例、修复并集成；结论来自本会话对应agent消息。

## Spec：review_spec

发现3个P2，全部关闭：

1. PDF覆盖缺口批次缺少原预览/明确text-only入口，Main仍读旧failed result。`986db73` + `dad0a9b`修为同operation固定IDs/currentmanifest和真实GUI确认；独立临时PDF反例转绿。
2. 无关Undo和纯标签刷新误撤销mapped origin。`986db73`/`73417c8`/`50c8bd0`分别区分标签身份、保留UndoB来源与排除后插区间；Undo原A/真实源部分删除后Redo不复活。三个原始临时反例及真实PM25通过。
3. 键盘点显式插入后按钮卸载导致focus落body。`79856ed`仅在explicit adapter成功后focus；自动target不抢焦点。独立真实Composer临时反例转绿。

前一阶段Spec闭合于行为 `75db8929`：最后导航terminal增量无新增发现；对应IPC临时独立2测试通过。source UI末次单token样式未改变产品行为。无未解决Spec发现，不代表未跑的实机矩阵通过。

## Standards：review_standards

覆盖Main document/Thread/op归属、预算/pin/settlement、freeze/dispose/late，展示订阅/Query、PM history/源身份、键盘/IME与共享焦点/组件规则。旧Electron导航签名候选依据本地Electron44.4.5类型及对应官方源码撤回，未作为缺陷；局部Button padding候选被design lint证实并改shared size source；import-limit两语言消息齐全。

前一阶段闭合于 `ac6330a4`：成功显式插入焦点、真实terminal才恢复IPC owner，以及thumbnail消费既有shared圆角token均无未解决发现。无文件修改或全套重复检查。

两轴限制：真实IME/VoiceOver/缩放/30min性能、provider/Host queue及原生导航事件时序没有独立运行证据；由主线程Dev观察与[验证](validation.md)明确区分。早期Dev租约失败根因仍unknown。

## 最后固定增量

两个reviewer分别复核ac6330a→36121ea的动态引用预览：受控root/symlink/Thread current、25MiB/64KiB预算、不调用put/save与保留PDF derivedDigest，均无新增发现；Spec另独立10项测试通过。

36121ea→3b932e04关闭modal增量两轴亦无新增发现：按钮/Escape先同步关闭仍挂载dialog，再parent恢复bookmark，cancel阻止默认关闭干扰，原owner/销毁/替换/IME守卫保留。Spec另独立两项定向反例通过。工程评审闭合，不代表未跑实机矩阵通过。

## UI拒绝后重新评审：72863d9..3918b64

旧行为评审没有替代用户UI验收。按截图组合重做后，同两位只读reviewer各自覆盖Spec与Standards，主Agent核实并修复：

- 展开后实际Enter为换行，More仍展示发送；改为展示当前有效行为，不覆写收起偏好。
- 展开动作焦点落按钮；回到同一editor，维持原caret。
- 多个隐藏external token连续相邻，方向键停在不可见位置；双向跳过完整连续区间，保留Shift扩选语义。
- 管理弹窗期间正文变化后使用旧bookmark；改用真实PM映射位置恢复。
- 首次及失败重试打开原生picker时，系统返回到即将卸载的按钮；打开前设定当前editor/caret为返回目标，保留owner/freeze/IME守卫。
- 自动choose-import完成仍强制focus，晚到抢走新用户焦点；临时insertion entry保留focus意图，自动为false、显式采用为true，跨IME/view延迟仍保留该意图，不修改IPC/持久化。

每项有真实PM/React反例，归档[红绿记录](validation.md#2026-10-08-ui-拒绝后的纠正)。最后836f591→3918b64的两轴关闭：Standards独立验证首次/重试×取消/成功四项，Spec九项覆盖这些路径及自动晚到不聚焦、显式采用聚焦；无剩余可行动发现。其他来源的“重新导入”在仍挂载管理Modal内，是单独合同，不机械把焦点送入inert editor；未宣称该入口有新的原生证据。

共享ActionMenu/Toolbar/外部附件/ReferenceSuggestions组合不拥有第二份业务协调器；缩略图沿用只读Query。共享popup层与chip圆角增量独立Standards无新增发现。

## Fresh视觉收尾

`impeccable_finish_reviewer`无实现历史、只读原生复核fee53ddf：disposition为ship，范围为浅色桌面宽窗的收起/展开/More与实际鼠标焦点。持久设计合同为连续输入表面、项目引用仅正文、外部附件单独分区、真实model/access状态、次级维护、token/Icon/Base UI。截图参考结构已落实；不能把AX按钮动作后的keyboard outline当作物理鼠标缺陷，实际坐标点击只保留caret。root后续补深色/565px停靠内容视口/长文件名与3918b64超限重试焦点链，见原生记录。

`impeccable_documenter`只读审查：无需改写全局DESIGN或刷新design.json；固定T3 SHA已写入交接，来源只支撑Surface/Banner/Prompt/Toolbar组合，不是复制T3业务架构。既有Button API/密度说明漂移不纳入本次任务。真实IME、VoiceOver、缩放、长会话、OS竞态全集和provider/Host queue继续列为证据缺口；用户认可pending。

## 图片／文件编辑语义：dd8d812..e0c43e5

Spec与Standards独立只读固定评审，未修改主树或治理状态，未运行GUI/Dev/E2E。此前UI认可不能替代本次用户验收。

初次fec2290及随后1b50c88发现并修复：

- 冷清单晚到前正文替换丢图片：metadata classification前暂缓普通编辑，读取失败提供显式重载；不复活已移除来源。
- locale更新解绑导入adapter使映射资格失效：绑定稳定、localeRef仅更新标签。
- 显式图片采用后按钮卸载失焦：图片及duplicate early-return遵守focus意图；自动false不抢焦点。
- 图片结构投影误用标签meta跳过map：独立结构meta继续映射位置/来源，保留源消耗fence。
- Renderer删除epoch ID但Main仍累加：Main按source ID保留版本摘要，仅其自有manifest核定外部image可退出；真实Main联合ACK失败/重试、shared hash与旧file版本通过。
- 尾部冻结引用分隔与原空行被破坏：image carrier不填原空paragraph，块分隔、cold doc、Undo/Redo及冻结原文保持。
- readonly分类及随后file label刷新重写canonical/sequence：cache跳过两种只读投影，来源观察仍执行。
- Main既有冻结literal全字扫描：同parser仅paragraph授权，prepare／durable adoption／SQLite扫描及absolute offsets正式验证；最后Thread canPrepareInput也同规则，旧失败源仅作为冻结原文不再误阻止发送。

Standards固定dd8d812..63e023e闭合，独立6文件61项通过；随后63e023e..e0c43e5窄增量复核无新增发现，独立Thread/token2文件4项通过。Spec在63e023e发现最后Thread门禁缺口，e0c43e5原反例及正式4项转绿后闭合；此前两个readonly middle migration旧反例及6文件61项亦独立通过。root最终50文件369项通过见验证页，不与reviewer数量合计。

**最终两轴无剩余可行动发现，结论固定于e0c43e5源码。** 治理文档由root单写；SDK PDF现有失败未在闭合阶段重复运行，基线复现与unknown根因继续保留。评审不替代用户视觉/真实IME及实机验收。
