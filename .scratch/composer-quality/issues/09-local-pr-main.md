# 09 完整本地PR合入main

Status: resolved
Blocked by: none

2026-10-08用户明确要求本地完整PR到main，带上本任务前面所有修改。来源基点a9cf9a9，原固定head eb2e79c，共37提交；目标main cb233c6，main独有两项合并记录文档，预合并无冲突。此前只在隔离树实现的限制不阻止本次授权的本地main合入；原checkout若有改动保留，不reset/stash，不push/远端PR/发布。GUI/真实provider验证仍不新增。

完整Spec/Standards固定范围重新独立覆盖，不以局部review代替；完整check/build及本地PR正文汇总01–08。新增组合finding：明确确认的重复@候选必须消费trigger；普通重复附件选区不消费保持。完整check还发现pure共享token别名被旧source gate误拒绝，补正例/负例后精确允许已声明token的纯别名，不允许局部覆盖共享token或独立值。legacy clipboard fixture补正确codec stub，不改生产失败降级。

工程合入后核实完整源head为main祖先、所有原37提交均纳入、目标树等于预期merge-tree、工作树状态，保存本地merge记录。用户认可/原生未覆盖范围仍pending。

完成：merge `98fa5db5b208214469d3d5013dc0f410fbc7e36d`，source `ec09aeb5d0b5677970b98a4eb7bfd2ab7725e39e`。37原提交全部纳入，目标树等于预合并结果；完整check/build、整段双轴通过。见[合入记录](../local-merge.md)。不push，acceptance pending。
