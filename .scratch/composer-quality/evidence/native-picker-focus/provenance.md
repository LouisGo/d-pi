# 原生附件回返焦点修复

基点45c7ef1，2026-10-08，仅既有composer-quality隔离树。当前截图是用户实机失败证据；没有当前Finder事件trace。

[真实red](red.txt)：共享入口1项、正式附件控件首次/重试×成功/取消4项，共5失败/28通过。正式控件先鼠标pointerdown→按钮focus→prepareNativePicker将editor设为返回焦点，再显式发送relatedTarget=null的focusin；旧共享逻辑丢失data-pointer-focus，中央CSS不再压住文本focus-visible。此前测试只核对caret及迟到结果不抢焦点，漏掉这个回返事件。

修复只有共享来源拥有者：记录已继承鼠标来源的实际焦点目标，仅同目标且relatedTarget=null保留；新鼠标意图、Tab/键盘导航、独立焦点及dispose清除。CSS、原生picker IPC、转换与插入/Undo业务不改。原反例及UI控件/Composer连续性最终[4文件70项通过](green.txt)，[Renderer类型](renderer-types.txt)、[design](design.txt)、[fast](check-fast.txt)、[build](build.txt)通过。Node24.21.0/pnpm12.8.1，合法隔离runner、maxWorkers4。

小范围单独只读reviewer覆盖Spec与Standards，固定差异SHA-256 3f431c854044dcf536fab22f7b3948faa7e759f54c63b9a4c3357b393e24044e；逐项manifest匹配，无可报告缺陷，见[源清单](review-source-manifest.json)。之后只更新治理文档与生成报告，行为源不变。

测试模拟的是原生回返focusin事件，不是实际Finder运行证据；未启动GUI/Dev/E2E/真实Host/provider。真实事件序列、视觉outline及用户认可仍待实机复试。保留React act与既有chunk警告。完整check未重跑，先前SDKPDF/CLI fixture未知不归本票。一次commentary误报81项已立即更正，实际输出为70。
