# M2 多 Thread 提醒：独立 Spec 复核

## 固定输入与范围

- worktree：`/Users/louistation/.codex/worktrees/m2-attention-review-spec/d-pi`
- 原 head：`46121f1fcf5574724f2c023c8beda6374366dfee`
- 新 head：`61f1e24efacaf8e5eda4189b84149a2da15eddae`
- 原 base 与新 head 的实际 merge-base：`7c9e1fee48ccb467db359a18401d8a30ca57a04e`
- 命令：`git status --short`、`git rev-parse HEAD`、`git merge-base <base> HEAD`、`git diff <original-head>..HEAD`、`git log <original-head>..HEAD --oneline`。
- 开始与结束工作区均干净，固定 SHA 未变化。复核模式是已完成全切片 Spec 审查之后的增量复核，并重新检查受影响整体合同；不是只阅读作者结论。

## 原发现复核

1. **导航提交前清未读：已修复。** AppModel.acceptRestore 中的 visible 发布已删除。AttentionContent.synchronize 只有 document 可见、hasFocus 且 pathname 与真实选中 Thread 相符时才上报该 Thread，其他情况上报 null。Main 原有前台/visible 双重约束与 trusted IPC 的 active Thread 校验继续存在。因此选中 B 但仍显示 A 的导航间隙不再把 B 宣称为已呈现，不再经 visible 清 B 未读；对齐后则恢复正常清读。

2. **同 trace 新请求被去重吞掉：已修复。** observeRuntime 在真实新增 pending ID 或 connectionGeneration 变化时用 renew=true 调用 add，绕过仅适用于旧事件的 kind+trace 去重；相同 pending 集合的后续 revision 不调用 renew。事件会更新 eventId、按实际 foreground/visible 重新计算 unread，并只按偏好在 App 后台尝试 native。原有 late revision 过滤、有界条目、清除已无 pending 的 needs-answer、native release 与失败收据/runtime 合并继续保留。

## 同批变更的合同核对

- **迟到失败终态修正正确。** 以目标连接/submission 身份记录 priorOutcome，允许 completed/aborted 后观察到 failed 更新提醒；相同 outcome 去重，priorOutcome=failed 后不让迟到 success 擦除失败。这与 SubmissionRepository.observePromptResult 的失败保留规则、foundation contracts 对 ACK 与后续执行结果的分离相符。未重发、未改 OMP 调度或收据事实。
- **harness trusted seen 断言修正正确。** 操作已经切回 threadA，向 interactionThread 发送 seen 应由 active Thread 校验拒绝；新断言检查 failed/invalid-request 与同 trace，另读 snapshot 确认没有 openRequest，保留 no resend/no answer 证明。该操作是非 active Thread 的 seen 准入检查，文案已避免把它冒称为真实 native stale-click 证据。
- **复制模式没有扩大产品范围。** package.mjs 仅给原 cpSync 加 COPYFILE_FICLONE，仍为 recursive/verbatimSymlinks；没有改 bundle 内容、IPC 或 App 产品行为。源码记录 source app.asar SHA，实际 source/副本 hash 同源需主 Agent 在本轮候选操作中独立核实，本 reviewer 未据此声称已验证。
- 原 base 到新 head 的提醒合同继续符合 Main 单源、偏好属 App SQLite、通知不是处理事实、通用文案不含业务正文、正常完成默认不弹提醒、不强切 Thread、点击受既有准入/保存/IME 流程、过期请求不发送旧回答、reload/关窗不解除 Main 观察与冷旧 Thread 只读边界。没有发现新增的可达高价值 Spec 缺陷。

## 证据与限制

独立阅读生产差异及回归测试后，才核对现有日志：attention-review-terminal-red 包含 completed 未修正为 failed 的真实失败；attention-review-identity-visibility-red 中 concurrent question 的 unread=false 是真实行为红，但其最初 visibility 断言假设 model.selectThread 后 Router 不会自动同步，不能作为该发现的红灯。后续 attention-review-visibility-red 采用 visible 命令发生时实际 router pathname 采样，明确发现一个非 B 路由时已上报 visible(B) 的失败，回归测试当前也用同样断言；attention-review-fixes-green 记录对应 3 文件 38 项通过。以上为主 Agent 留存执行证据，非本 reviewer 本地重跑。

本 reviewer 没有 install/build、复制 App、改源码/状态或 commit。未在隔离 worktree 重跑自动门禁（无 node_modules/磁盘受限），未执行 actual macOS package、系统通知显示/点击、窗口焦点、候选 source/复制 app.asar hash 或 ZIP 同源；这些仍由主 Agent 做实机证据核实。没有把工程日志当成产品认可，M2 与用户认可保持开放。Standards 轴由另一 reviewer 独立复核。

结论：原两项 Spec P2 均已关闭；此次 Spec 增量及整体受影响合同复核新增发现 **0**。结论适用于 `61f1e24efacaf8e5eda4189b84149a2da15eddae`。
