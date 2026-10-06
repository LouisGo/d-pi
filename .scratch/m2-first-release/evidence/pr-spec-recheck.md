# d-pi PR Spec 增量独立复核

固定输入：base `f7dff7bc2c980ae1a61fb7f3736d15a0de6a6d8c`，head `3c4c1060cd7943cb435ac73da3d8bd03433d4954`。只读 `git show` / `git diff`；18 差异文件中重点逐项覆盖全部生产修复、相关新增测试、红绿证据和状态/交接变化。工作树初始干净。保留 `/tmp/d-pi-pr-spec-final.md` 原报，不覆盖原 P2 结论。

结论：**原 P2 在固定新源码中关闭；增量及原整体合同衔接未发现新增可触发高价值 Spec 问题。**

## 原 P2 关闭依据

- Main `ThreadAttention.Context` 接入真实 `getActiveThread`，application 装配从当前 `services.store.threads.activeThread()` 读取；不是 Renderer 自报或测试常量。`isVisible` 先核对实际前台与可见 Thread，只在可见相关路径查真实当前身份，读失败返回 false。`add`、`seen`、`clearCurrentUnread` 共用该判断，所以原 Main 已选 B、旧 visibility 仍 A 的异步恢复窗口内，A 新 needs-answer/failed 保持 unread=true；旧 seen 与 foreground 往返均不能再清掉 A 未读。
- Renderer `current` 仅允许 `threadTransition === undefined`；pending 会把 selector 从 A 改 null，触发既有同步 effect 撤销 visible。恢复后仍须现有 pathname 与确认 Thread 对齐才声明可见；保留 unknown、路由准入和新 B 不提前已读合同。
- 固定新增真实 SQLite/AppStorage + DesktopCommandService + ThreadAttention 回归先断言已实际 select(B)，再在 selection Promise 回复前输入 A 新问题；覆盖 unread、旧 seen 拒绝、foreground 往返、failed、回 A 正常清未读。红灯准确为 `unread=false`。固定新增真实 React/AppModel/Router 回归保持 selection gate，pending 的最新 visible 先红为旧 A，修复后 null、最终 B；没有仅复述 helper 的断言。
- 三份固定证据分别保留 Main 红灯、GUI 红灯及 4 文件 36 项 green。复核者查阅日志和测试源码，未自行重跑矩阵，不将作者日志冒称复核者亲测。

## 与原范围衔接

修复只收紧展示已读资格；未改变 Runtime/收据归纳、eventId/去重、OMP 执行与调度、通知开关/本地偏好、当前事件导航定位、通知失败 trace/Thread 诊断及白名单导出。foreground 但选中别的 Thread 时保留 App 未读；读取当前身份失败也保守保留未读。真实业务事实/历史仍由原所有者持有，没有增加通知驱动的发送/重试或恢复写入。

依然依据原 spec/01a–c/06e–g 与导航合同：路由、Main 确认身份和聚焦均满足后才能已读；冻结/inert 的旧页面不替代确认显示。此次修正与这一要求一致，不是调整规格迁就实现。

## 验证边界

源码固定 3c4c106，版本已增至 m2.20；旧 m2.19/48cd01cc 是修复前实际候选，不能证明本 P2 的新源包内验收。固定 review/spec 明确完整检查、独立复核与新包验证随后补齐。PR body 内原 796 check 与 m2.19 验证应在最终交接中保持历史身份并补充新源结果，不能被解释为 3c4c106 已通过全部准入。

原生系统显示/点击仍 01c claimed，整体 V1-00/B6、真实供应商、M2 父范围和用户认可开放；不将这些明示待验列为新增缺陷。本次未安装、构建、启动 App、执行工程矩阵或修改源码/票/提交；结论是 Spec 源码与已保存真实行为证据复核，不能替代修复后实际候选验收。
