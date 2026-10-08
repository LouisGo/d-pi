## Summary

Composer将外部图片保留在独立缩略图栏，正文编辑和Undo/Redo不会增删图片；其他文件按MIME以内联chip呈现，包含类型图标、颜色、名称和大小，参与正文历史。项目@仍内联，重复来源不重复采用；默认重复的大块附件状态移入对应详情，失败标记及恢复入口保留。按固定T3的组合和images/files分工，用现有d-pi组件实现。

复用M1补全/键盘/焦点及M2映射导入、批次Undo、取消/部分失败/Thread隔离；修复冷恢复图片保护、语言切换撤销落点、显式采用焦点、冻结引用块分隔和空行。Main按来源保留历史摘要，仅退出已确认的外部图片依赖；真实update ACK前不释放candidate。冻结原文的token字样不授予附件身份。所属[规格](spec.md)及[05票](issues/05-attachment-semantics.md)。

## Evidence

源码e0c43e5，本轮增量dd8d812..e0c43e5，完整任务基点a9cf9a9d；仅本地分支codex/composer-quality。50文件369测试、完整typecheck、fast/design/i18n/interaction和build通过；真实Main+PM+SQLite与React fixture，原始红绿见[证据来源](evidence/attachment-semantics/provenance.md)和[验证](validation.md)。独立[Spec/Standards评审](review.md)按固定范围复核。

用户负责本轮实机验收，未启动GUI/E2E；没有本轮视觉或真实IME通过结论。既有SDK PDF复制fixture失败在未改1b50c88亦复现，根因unknown；先前CLI fixture失败保留，完整check未重跑或宣称全绿。DOCX/视频等展示没有新增转换器。见[交接](handoff.md)。

## Merge Danger

跨Renderer/Main的图片分类、历史与草稿依赖必须同版交付，不能把Main累计ACK假称缩减ACK；文件旧版本/shared digest、clipboard cleanup和import settlement仍需真实保护。无IPC/DB/Draft版本迁移，沿既有所有者和权限，未新增队列或重发。回滚源码前关闭此Dev；revert不撤销已保存草稿和资产，不删除数据库或OMP历史。无远端push/PR/发布。
