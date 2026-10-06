# 04c 项目文件与目录引用

Status: claimed
Blocked by: none

2026-10-06用户明确授权：@可选择目录，@@virtualList应优先显示@virtualList目录；文件/目录有可延续的类型和不同展示；采用性能写法。本段从da9920d、codex/m2-lifecycle接续，不push。

验收：文件/目录typed DTO贯穿候选与保存/冻结来源，匹配目录优先于包含该目录名的后代文件；键盘确认只插入引用不发送。目录语义参照固定OMP18.4.6 file-mentions.ts：发送时冻结直接条目清单，非递归读取所有正文；超限/拒绝/变动明确失败保留草稿。既有file manifest无新字段继续按file处理。

Main拥有有界项目索引，共享同项目并发首次构建，复用暖查询；有界内存/工作量、缓存更新与关闭，拒绝symlink越界并复核Thread目录身份。Renderer只读Query限频，查询与显示身份一致，旧结果不可选，不搬走导入/发送副作用。测量实际规模冷/暖查询及I/O，验证刷新/过期/并发/线程隔离。

独立工程与正式UI一起交付；按风险测试/类型/门禁/两轴review，补必要Electron可见证据。保留unknown不重发、冷旧Thread只读与M2其它开放范围；无新增产品待决。
