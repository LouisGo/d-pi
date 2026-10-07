# 变化记录与 Git

日期：2026-09-27。深度：M1 只读差异与工具证据；M3 Git 写操作及完整变化管理。依据 D-14/D-15/D-20/D-37；[基础方案 §3](../../product/first-release.md#3-变化记录先明确证据再展示-diff)为基线和归属的详细合同。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- Git 只读合同在 `src/modules/changes/contracts/`，读取实现在 `src/modules/changes/main/project-git.ts`，Renderer 查询面在 `src/modules/changes/renderer/`。
- 复用 files 的公开读取能力，不写工作区或 Git index，也不推断作者；查询与缓存规则见本页"读路径的查询与缓存"。

## 范围与拥有者

Main 的变化功能通过成熟 Git 机制查询仓库，消费原生工具证据，为自有 Git Panel 提供明确来源的差异。Git 当前状态和工具报告是不同事实，不能合并成“全部 AI 改动”。

Git 视图负责选择比较对象和业务操作；[文件/Monaco](files-editor.md)只读内容并展示 Diff。[阅读模块](conversation.md)提供带原生关联的记录级工具证据，本模块判断它是否足以支持一个操作前后对比，不以卡片摘要替代原始结果。

## 交接

| 来源 | 提供给 UI 的数据 | 必须保留的边界 |
| --- | --- | --- |
| Git 查询 + 工作目录上下文 | 仓库身份、HEAD/index/worktree 来源、捕获时点、文件状态 | 不证明作者或本次执行归属；未跟踪文件单独表达 |
| 原生工具结果 | 会话/实例、toolCallId、结果与错误/截断、可用前后内容 | 调用参数不等于成功结果；没有前文就不补造工具执行前快照 |
| [文件功能](files-editor.md) | 明确两侧内容、版本/缺失和覆盖信息 | 每个 Diff 显示基线；读取期间变化需重读或标陈旧；选区引用保留所选侧的来源与捕获版本 |
| 用户选择差异/路径 | 打开指定来源的只读查看意图 | 不隐式暂存、回退或修改文件 |

工具证据不够画 Diff 时，显示结果与路径；可另行打开该文件的当前 Git 差异，但明确这是另一个来源。非 Git 项目仍可查看文件和工具结果。

## 读路径的查询与缓存

`renderer/public.ts` 暴露 Git 的 Query key、请求构造与 `useChanges`/`useDiff`；key 使用真实 ThreadContext（Thread、工作目录身份、实际目录）、scope 与路径，选中另一资源或另一侧不会串结果；未选中的显式 fetch/refetch 不发 IPC。GitReadError 保留该次请求的 trace/operation 及业务回包或 transport cause。本地采样按 D-37 显式使用 `networkMode: 'always'`；`unavailable`（非 Git/缺失/拒绝/二进制/超限/冲突/变化中）作为业务结论如实显示，不作为可重试错误；wire typed failure 由查询层按受控 code/retryable 判定是否重试；旧 `unavailable("failed")` 仍转成归因 unknown 的错误，但不会自动重试。刷新为显式动作，不做定时轮询；缓存不改变来源与覆盖字段，也不能把旧采样冒充当前 Git 状态。

## 生命周期与失败

仓库查询按工作目录隔离，视图关闭可释放订阅和缓存，磁盘/Git 仍是事实来源。读取只需当前场景，先使用显式刷新和操作后的刷新；是否增加监听由真实交互需要决定，不先铺全项目文件监控。

只读 Git 不加载外部 diff/textconv 等项目可执行配置，不临时提交、stash、切换分支来采样。无 Git、无 HEAD、冲突、二进制、超限、权限或读取失败按真实情况表达，不能返回空 Diff 冒充无变化。

## 第一批交付与验证

M1 交付 HEAD ↔ index、index ↔ 工作区及未跟踪文件状态；工具有可靠证据时显示工具差异，否则显示受限详情。验证已有用户修改与 Agent 修改混合、新增/删除/重命名、暂存和未暂存并存、外部并发修改与非 Git 项目。

通过标准：左右来源可追溯、没有伪造前文或作者、所有路径保持只读。工作区当前状态不倒填为崩溃前或工具运行前的快照。

M3 按场景加入暂存/提交/分支等 Git 写操作及 worktree 管理；worktree 的目录关联仍归 Thread。Agent Changes、Run Changes、Review、Revert 只预留来源字段和组合点，Run 起止、归属、Review 对应版本、Revert 对象和并发条件需在该切片确定。原生会话回退不等于文件回滚，不提前选 Git 命令或建全工作区快照平台。

## 共享读取资源与完整结果（T3 基础重构，2026-10-07）

Git 沿用 files 的只读 operation/cancel DTO、可信 sender/Thread 准入、Query shared observer 和取消生命周期。Main 创建唯一专用 Git runner，所有 list/diff 共用；不引入新 Effect 范围，不改 OMP 或 Git index/worktree。

真实子进程最多4个，等待 spawn 的命令最多32个，过期/取消排队请求不 spawn；预算满返回不重试的 busy。每命令10秒，整体 operation最多30秒。许可从spawn前持续到真实child close和输出收束；abort callback不能提前释放。取消/timeout发送所属child的TERM，500ms未关闭升级KILL；close拒绝新请求、取消队列与活跃操作并等待所有实际资源收束。

stdout分别沿用config key（NUL name-only）1MiB、状态4MiB、正文5MiB发布预算（runner额外1024字节用于拒绝超限），stderr最多64KiB；超限终止并返回too-large，机器结果不截断解析。raw bytes完成后才严格UTF-8/NUL/字段校验，不完整状态/rename/config或不可表示路径是malformed-output，不是完整数据。config防护读取失败必须fail closed；只有已证无HEAD返回null。前后样本读取失败保留实际failure，只有成功样本不一致返回changed。runner无内部重试，Query只重试明确timeout/io/可确认transient exit。

原路径授权、symlink/FIFO拒绝、filter/fsmonitor/external-diff/textconv防护、SHA-256、HEAD/index/worktree来源和双采样复核保留。诊断只记录trace/operation、安全有限code和阶段，不保存原始stdout/stderr/path/args。
