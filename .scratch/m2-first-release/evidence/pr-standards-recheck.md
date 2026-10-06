# d-pi PR Standards 独立增量复核

结论：修复范围内新增确认高价值 Standards 问题 **0**。固定源码支持修复 Main 选择已改变、旧 Renderer 可见性尚未解除时误清未读的路径；保留原完整组合边界。本结论不表示新候选或用户验收通过。

## 固定输入

- base / 实际 merge-base：`f7dff7bc2c980ae1a61fb7f3736d15a0de6a6d8c`。
- head：`3c4c1060cd7943cb435ac73da3d8bd03433d4954`。
- 初始 HEAD 等于固定 head，工作树 clean；审查 `git diff base...head`，以 `git archive head` 保存相关源码与原始红绿证据到 `/tmp/d-pi-standards-recheck.JmV8ix`。
- 延续原整体评审已读的 AGENTS、TypeScript/state-query/headless/design-system、基础/诊断/导航合同；复核新增 Main 接线、ThreadAttention、React selector、两条真实回归、IPC fixture 及直接所有者调用链。没有按后续浮动源推断结论。

## 修复与组合边界

`application.ts:265-266` 从当前 `services.store.threads.activeThread()` 读取 Main 的真实选择，没有缓存第二份活动 Thread 或改写选择。ThreadRepository 通过原 SQLite metadata 和 ThreadContext 读取；DesktopCommandService 的 select 先同步持久选择，再在 restore 中等待目录核实。因此新增 Main 回归捕获的是实际已提交选择、异步 ready 尚未返回的窗口。

`thread-attention.ts:140-168` 将 `isVisible` 统一为窗口前台、Renderer visibleThread 和 Main activeThread 三者一致，owner 读取失败返回 false。add 以它生成 unread，clear/seen 也复核它；身份错配、库不可用或缺活动 Thread 都保留未读，不将未知 owner 当作已读。读取只出现在新提醒/已读处理路径，正常无事件 Runtime revision 不新增 SQLite 读取。没有修改 receipt/Runtime 事实、OMP 所有权、unknown 不重发或冷恢复政策。

`attention.tsx:68-73` 只有无 Thread transition 时才给出 current，pending 与 unknown 均为 null；原同步 effect 在 pending 发 `visible(null)`，选择和 pathname 同时对齐后才恢复对应 Thread。selector 仍返回稳定原始 ID/null，不复制资源；Router 准入、草稿冻结/保存、inert、openRequest 消费、迟到事件当前定位与 RAF 清理保持原样。视图卸载没有停止后台执行。

新增必填 getter 的全部当前生产/测试构造点已核对。机器依赖报告新增项仅为 Main 组合回归的同应用测试依赖；生产跨模块公开面未扩大。package version 改为 m2.20 与“m2.19 不含本修复”的交付边界一致，版本号本身不构成新包证据。

## TDD 与实际检查

读取 fixed head 原始日志：Main 回归旧源 14 pass/1 fail（期待 unread=true，实际 false）；真实 React/Router 回归旧源 8 pass/1 fail（pending 期待 visible=null，实际旧 ID）；修复后相关4文件36 tests pass。Main 用真实 AppStorage/SQLite、DesktopCommandService、ThreadAttention，验证新问题/失败、seen 拒绝、前台切换及回到旧 Thread 后正常已读；GUI 用生产路由/模型与实际 React 挂载验证 pending 解除可见性及最终恢复。这些是提交保留的主 Agent 测试结果，本 reviewer 未重跑。

Reviewer 实际执行 `git diff --check base...head -- src package.json architecture` 通过；全差异 diff-check 只报三个新增原始红绿日志的 EOF 空行，属于证据排版，未列作高价值缺陷。

只写本报告和临时 archive，未安装、运行测试、构建、启动 App、修改源码/票/管理状态。原整体报告仍见 `/tmp/d-pi-pr-standards-final.md`；新固定源码的工程全检查由主 Agent 继续核实。旧 m2.19 的18项实际包检查、原生关窗/Finder重开和几何证据不能证明 m2.20；真实通知显示/点击、完整 V1-00/B6、真实供应商及用户认可仍独立开放。
