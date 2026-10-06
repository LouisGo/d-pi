# 实际原生操作记录

2026-10-06，clean产品ba0e7df，bundle ID local.d-pi.m2-validation，隔离root `/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-N3TjGL`。Computer Use经macOS AX与原生截图操作，不替换save dialog、IPC或bridge。

1. Save检查点：实际「Save As」设置 diagnostics-export.json，经⌘⇧G进入指定隔离root，确认目录并保存；GUI AX显示「已导出」。检查文件3426字节、0600、脱敏字段和clean build/hash后创建save-continue。
2. Cancel检查点：查看实际macOS保存对话框截图，刷新完整AX后点Cancel。GUI AX显示「已取消导出，没有保存文件」，先前报告保持；随后创建cancel-continue。
3. Writer检查点：harness临时保全logs目录并以普通文件占同路径，触发真实EEXIST。AX实际警告「诊断日志暂时无法写入…草稿是否保存仍以编辑区的保存状态为准」，点「知道了」；窗口仍有A_UNSENT_DRAFT、保存状态与OMP ready。创建writer-warning-continue后harness恢复路径并查询，Writer degraded=true/dropped=4，GUI截图明确退化/丢弃与覆盖。

三次检查点均在有效期内完成，最终harness exit0、21项检查通过。原生对话框操作为人工Computer Use，包内主题/窄窗/Copy/Escape及其它行为使用实际Electron/CDP trusted输入；560px为Chromium视口，非声称macOS窗口可缩至该宽度。Copy原剪贴板安全snapshot且restored。所有操作仅针对隔离App，未删除/修复个人数据或使用真实账户。
