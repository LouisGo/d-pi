# 06 Thread 主区基础布局与工具收纳

Status: claimed
Type: task
Blocked by: none

## 授权与范围

2026-10-07 用户要求先将 T3 最新代码拉到 d-pi 同级目录，随后清理 Thread 主内容区。上方是消息滚动区，下方是 Composer；测试、配置和检查内容按需展开。本轮不深入改写消息内容呈现或 Composer 能力，不删除历史数据。

固定基点 56f0b0a；分支 codex/thread-layout；隔离工作树 /Users/louistation/.codex/worktrees/thread-layout/d-pi；主 Agent 串行实现。沿用 D-16/D-24/D-32/D-33/D-37 与现有三层工作台。

## 所有权与验收

布局与工具展开只属于 Renderer 展示；ThreadModel、草稿、执行、ACK、历史和恢复所有权不变。配置/子 Agent/文件/收据/历史保留入口，健康运行快照默认不占主区。待答、停止、队列异常和只读/失败信息继续可见，不因收纳失去处理路径。

行为回归：工具默认关闭，展开/关闭不重建编辑器/阅读面板；健康 runtime 按需检查；既有通知定位、草稿连续性与队列操作不退化。真实 Electron 验证 light/dark、1440×900/720×540、独立滚动、长稿高度上限、工具边界；模拟桥接与真实 provider 分开表达。

## 验证记录

新增默认关闭测试先在旧实现失败（找不到 thread-tools），最小实现后通过。其余结果随收尾追加；用户试用与认可仍待反馈。
