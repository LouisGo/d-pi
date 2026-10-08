# 05 图片独立、文件内联与去重

Status: resolved
Blocked by: none

2026-10-08用户新反馈取代前一版所有外部附件隐藏在正文/rail展示的选择：外部图片不进入PM文档及Undo/Redo；其他文件按MIME呈现内联chip并进入编辑历史；项目@仍内联；同一Composer附件去重；移走重复的大块失败展示，失败状态就近可发现、详情中可恢复。可直接参照固定T3展示/处理方式，保留d-pi资源、草稿、可信clipboard、immutable send/native queue边界。本次用户自行实机测试，Agent不启动/运行GUI或E2E。

root在现有隔离集成树单写图片/编辑/去重/接入与治理；MIME leaf在/Users/lou/.codex/worktrees/composer-mime/d-pi，以dd8d812为基点，单写节点badge/attrs/CSS与对应测试。串行集成后固定双轴只读评审。

自动化验收：图片增删不改变PM历史及redo分支，文件Undo/Redo不改图片，混合batch采用/原位置/取消/partial与跨Thread保持；草稿持久/重挂载/不可变捕获保留图片，消费/替换清理；同ID和重复源不新增节点，不同内容不误合并；MIME icon/颜色/大小/可读状态，默认无重复文件rail/大块错误面板；可信copy/paste及历史资源门禁保留。输出源码、红绿和类型/门禁/build结果，视觉用户验收pending。

交付：e0c43e5。图片外置、其他文件MIME内联、采用去重、默认重复失败面板移入详情及资源/冻结source边界完成；最终50文件369项、完整types/门禁/build通过，两轴独立评审闭合。原始日志见[来源](../evidence/attachment-semantics/provenance.md)。本轮不运行GUI/E2E，用户视觉/IME/OS体验验收pending。现有SDKPDF复制fixture在本次及未改基线均失败，根因unknown，不属于本票新增转换支持；未宣称完整check全绿。
