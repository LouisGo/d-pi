# 08 鼠标选择附件后原生回返焦点出现outline

Status: resolved
Blocked by: none

2026-10-08用户反馈点击附件按钮、Finder选图后正文出现蓝色outline；授权继续修复同一Composer，仅既有隔离树，基点45c7ef1。用户实机自行验证的范围保持；不开Dev/GUI/E2E/真实Host/provider，不push。

现有共享逻辑记录鼠标触发目标，但程序将返回焦点放在编辑器后，relatedTarget=null的同目标focusin会丢失鼠标来源。截图证明实际出现outline；事件序列通过正式控件与共享入口反例重现，并非实际Finder事件trace。

修复共享焦点拥有者，记住已经获得鼠标来源的实际焦点目标，仅原生回返至同一目标且无relatedTarget时保留；Tab/键盘导航、独立无障碍目标及新的鼠标意图仍按原规则更新。不局部覆盖CSS、不移除caret、不在异步导入结束时强行focus。

验收：首次/重试×成功/取消的正式附件控件回返事件保持鼠标来源；Tab后不可恢复旧鼠标来源，独立目标不继承；既有portal与编辑键路径继续正确，迟到导入不抢焦点。源反例5失败，修复后相关集合通过；类型/fast/design/build及小范围独立复核，实机认可pending。

工程交付：正式与共享反例5失败→4文件70项通过，Renderer类型/fast/design/build通过，独立单reviewer Spec/Standards无可报告缺陷。见[来源记录](../evidence/native-picker-focus/provenance.md)。未冒称Finder实机已通过，用户认可pending。
