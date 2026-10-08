## Summary

鼠标点附件按钮并从Finder返回编辑器时，共享逻辑会清掉鼠标来源，正文重新显示focus-visible outline。共享入口现在仅在回到已继承鼠标来源的同一焦点目标、且relatedTarget为空时保留来源；键盘/独立焦点仍正常。不加局部CSS，不在异步附件结算后抢焦点。[08票](issues/08-native-picker-focus.md)、[规格](spec.md)。

## Evidence

基点45c7ef1，新增5项真实反例先失败；正式控件、共享入口、UI控件和Composer连续性4文件70项通过，Renderer type/fast/design/build通过。小改动独立单reviewer覆盖Spec/Standards无可报告缺陷。[原始来源](evidence/native-picker-focus/provenance.md)、[验证](validation.md)、[评审](review.md)。

没有本轮Finder事件trace或视觉通过结论，自动化模拟relatedTarget=null回返事件；实机用户复试pending，不运行GUI/Dev/E2E/Host/provider。完整check未重跑，既有SDKPDF/CLI fixture未知保留。

## Merge Danger

只改变共享焦点来源记忆，影响全App输入与portal；同目标返还、Tab清除、独立目标及旧来源路径已覆盖，无DB/IPC/权限变化。可revert本轮源码，无数据迁移；实际浏览器/原生回返仍需用户确认。仅本地commit，无push。
