# 有界长正文独立评审

本段base/merge-base `df41925401d6f64cfe4ea73432ca00523f7a5a94`，产品source `c531558406e3c3b7da4544be8df55fe92d40530f`，验证范围至`3fdb25f5c96f8b126d9b75fcbb1eaa7e8198dd6e`。两名只读reviewer分别覆盖Spec/Standards，在独立checkout固定HEAD，初末clean，未冒称重审整个累计M2分支。

[Spec报告](evidence/long-reading-spec-review.md)、[Standards报告](evidence/long-reading-standards-review.md)及[交接/原始证据](long-reading.md)。最终无未关闭的高价值问题。

Standards发现harness在beforeCopy拒绝后，未拥有但内容相同的剪贴板可能被hash fallback覆盖（P2）；删去未拥有恢复入口，命名pasteboard先失败后通过，用户后续复制保留、多格式/binary/超1MiB文本及预算拒绝八项/残留0复核。属于验证工具修复。

主Agent实际包发现Copy权限拒绝，新增失败Main回归，只开放当前WebContents/主框架/当前URL的sanitized write，check/request一致。31项相关回归和最终实际包40784 units精确复制/restored，双轴复核关闭；其他权限/来源拒绝仍成立。

两轴核对长正文预算、surrogate/CRLF及换行、复制原文、Thread/Host/历史来源隔离、已封闭段DOM/选择保留、历史/工具/子Agent消费既有投影、主题密度及原生缺口。21项机器结果、dirty=false、app.asar身份和10MiB artifact/41077 bytes所得原文分别核验；最后6行取景修正关闭旧工具截图离屏限制，实际末段清晰显示SDK省略/artifact提示。

工程与fixture/native GUI证据不等于真实供应商或用户接受。固定M2性能/故障全集、系统IME、PDF视觉/OCR与原有产品待决仍开放，不据此关闭父06或M2。
