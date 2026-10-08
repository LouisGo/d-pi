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
