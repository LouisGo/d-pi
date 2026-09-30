# 05 工作区与状态接入

Status: resolved
Blocked by: none

阶段：既有 M1 重写。授权、待决项与继续边界见 [spec](../spec.md#推进与交接)。受影响决定：D-05、D-17、D-21/D-22、D-24、D-28–D-37 与 B-01，按实际触及项核对。

## 交付与验收

按规格三/四重写工作区就绪与资源所有权、展示模型/实体访问、只读 queryOptions 和编辑器资源绑定。代次/Thread/版本验证保留；不决定新的缓存保留策略。目标缺口先红灯，必要 GUI 验证与试用。

## Comments

2026-09-30：从准备提交的干净 `codex/rewrite-core` 开始；不维持旧内部类/补丁形态，但保持正确的产品合同、事务、恢复与执行所有权。完成后记录实际验证、未覆盖项与提交。

准确选区切片：Monaco 会归一化换行，旧回调曾将归一化正文标为原文件版本；旧 model 还可能借用新 view 的来源。files 现在按挂载时的原文、版本和 model 冻结选区，失效 model 与清理后的回调不再发布；核心 UTF-16 行列映射同时处理 CRLF/LF/CR，换行不占列。两项核心红灯和三项生产回调红灯后，相关四文件 14 项通过；回调用窄 Node doubles 执行真实生产 effect，不冒称 React/Monaco GUI。实际混合换行选区与输入接入留给 07 随包验证。本票工作区、查询、实体与输入生命周期继续实现。

完整资源切片已冻结：应用级 ThreadModel 先构造 controller/提交/运行/阅读及绑定，完成后发布 ready；应用展示只引用这一资源，保存闭包始终属于原 Thread。AppModel 的真实请求代次拒收迟到 restore/preferences，dispose 先撤销展示和资源身份。编辑器重挂载读取 controller 的 pending/基线正文，旧 IME 与附件回调只访问原绑定并核对当前 Thread；视图解绑不停止业务。Runtime 切换目标清除旧 view，让新 Thread revision 1 能被接受。目标发布/代次、重挂载/旧回调、释放后迟到 save/prepare 与 Runtime 切换均有真实红→绿，既有 ACK/新输入/旧 cleanup/unknown 行为绿色回归，不伪称新增红灯。

文件/Git 工厂共用真实 ThreadContext（threadId/workspaceId/directory）及路径/scope；未选中 key 为 null，目录根空路径仍合法。未选中显式 fetch/refetch 目标测试原先各调用两次 IPC，执行 guard 后零 IPC；错误保留该次 trace/operation/reply/cause。本地 always、业务 unavailable 与采样重试、既有刷新策略保留。Conversation/收据发布生成 ID 顺序和实体 Map，行 O(1) 取项，未变化实体/顺序引用保持，不产生独立可写正文。

子 Agent 定向 22 文件 112 项、root/core/renderer tsc、29 文件 Biome 与 188 源文件架构检查通过。主 Agent 集成 `pnpm check` 全项通过：六套 tsc、设计/i18n/源码/文档/结构门禁、37 项 Node 门禁、342 项 Vitest，1 项既有原生 opt-in 跳过。新真实 workspace 类型依赖已进入机器单源并重新生成实际依赖报告。冻结 snapshot `/tmp/d-pi-rewrite-review-core-b` 正由独立审阅者核对，发现只以新补修记录处理。真实 GUI、试用与最终构建身份留给 07，工程绿灯不替代用户体验认可。

后续 07 已完成第二轮独立审阅、正式包和受影响 GUI；CR 预览补修按 TDD 完成并重建复核，最终完整 check 为 343 项 Vitest + 1 跳过、37 项 Node。明确源码/构建、真实选区/编辑器/只读冷恢复与试用步骤见[本轮交接](../handoff.md)，用户反馈尚未取得。
