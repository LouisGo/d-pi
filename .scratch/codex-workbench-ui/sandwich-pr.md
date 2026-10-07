## Summary

原竖向一级栏占用主内容宽度，底部版本与会话信息分散。将功能入口迁到Thread列表底部：左宽设置Modal，右窄开发工具；移除Home icon。整窗改为导航/title、中部内容、固定28px状态栏，顶底按实际列宽同步，包括拖拽过程。主状态段只读Thread公开状态，提供有界消息概况及快速预览。

规格与当前设计合同统一为三层布局，原始历史证据保留。[当前规格](spec.md#2026-10-07-当前切片三层布局与横向功能导航)、[05票](issues/05-sandwich-layout.md)。

## Evidence

源码/验证commit：`bded41f`，基点`d4f380c`。完整check：830行为、35架构、96tooling通过，2个行为skip；build通过。三层与组件各27条真实Electron fixture检查通过，原工作台68条记录通过（67检查+1CDP帧采样）。尺寸竞态及overlay残留各有真实失败→修复→通过，不用脚本调整掩盖初始尺寸错误。

[验证与Dev试用](sandwich-validation.md)、[独立Spec/Standards审查](sandwich-review.md)。本地分支`codex/sandwich-layout`；未创建远端PR，不将完整门禁/隔离SDK/GUI声称用户认可。

## Merge Danger

Door: two-way，原因是视图结构、组件适配与只读状态接线可用revert恢复，没有持久化迁移或外部执行副作用。影响链：shell顶底预算→嵌套split真实尺寸→页面/焦点/覆盖层→Thread状态订阅；既有布局意图格式不变，token/cache/context未新增原生数据接口。

回滚按最后文档/证据commit、`bded41f`、`5b60446`顺序revert；不删除App数据或OMP记录。Dev按checkout隔离App数据但仍沿用共享原生配置。系统IME/VoiceOver、物理拖窗、长时性能和真实供应商未验证，原A3/用户认可保留。
