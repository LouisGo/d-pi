# 多 Thread 提醒 Standards 独立修复复核

## 固定范围

- head：`61f1e24efacaf8e5eda4189b84149a2da15eddae`。
- 修复差异：`46121f1fcf5574724f2c023c8beda6374366dfee...61f1e24efacaf8e5eda4189b84149a2da15eddae`。
- 整体差异实际 merge-base：`7c9e1fee48ccb467db359a18401d8a30ca57a04e`，与指定 base 一致。
- 审查目录仍为 `/Users/louistation/.codex/worktrees/m2-attention-review-standards/d-pi`；开始/结束 HEAD 一致、工作树干净。
- 延续原报告的独立 Standards 覆盖及当前合同，补查全部修复生产代码、回归测试、harness、结构报告与提交内红绿证据；不接收作者结论代替源码判断。

## 结论

原报告两条 P2 已修复；本次没有新高价值 Standards 发现。

1. **同提交迟到失败纠正：通过。** `thread-attention.ts` 现对同 outcome 去重、对已 failed 保持 sticky，允许 completed/aborted 的真实 failed 纠正继续发布。实际执行固定 head 的真实 `ThreadAttention` 类，验证 completed→failed 后产生不同 eventId、kind=failed、unread=true、原 trace 保留且系统提醒仅一次；重复 failed 和随后 completed 保持原 failure 事件且不重复提醒。execution 持久收据仍是权威，未增加派发、执行恢复或第二套提交事实。
2. **非 active seen harness：通过。** `attention.mjs` 保留先切回 A，再对交互 Thread 发 seen 的反例；现在明确断言 failed/invalid-request 与请求 trace。随后独立 snapshot 查询确认 openRequest 为 null，并核对 provider 请求数、原生回答文件不变。Main 的 known/active Thread 检查保持，没有为了 harness 放宽权限。
3. **路由/可见已读边界：符合合同。** AppModel 确认 Thread 选择后的提前 visible 已移除；生产 Renderer 只在 AttentionContent 中报告可见身份，条件是 `document.hasFocus()`、非 hidden、pathname 与已确认 Thread 对齐，否则报告 null。原 Main 前台校验、source generation、active Thread 验证与 seen 的 eventId 检查继续保留。新增真实 React 回归会记录 visible 请求发出时的实际 Router path，避免 Main 已选 B 而路由仍为 A 时提前清 B 未读。
4. **同 trace 的新待答身份：通过。** observeRuntime 仍先核对 revision/connection generation，再以新 pending id 或代次变化判断真实新增；仅这个路径 renew needs-answer。直接执行真实类验证：前台旧问题已读后，后台同 trace 新增第二问题产生新 eventId/未读及一次提醒；后续同 pending 集合重复视图保持事件和通知数。没有重发旧回答或把提醒变成交互事实。
5. **候选复制：未改变产品权限。** package harness 的 cpSync 增加 `COPYFILE_FICLONE`，其余 recursive/verbatimSymlinks 和隔离 bundle 流程保持。该修改只影响候选复制方式，没有改变 Main trusted source、文件/Thread 授权、原生执行或应用身份。实际构建身份仍应由包内 metadata 与 asar/ZIP 同源核验，不能从副本目录名或 clone 参数推导。

## 实际验证与证据分层

- 本 reviewer 本次执行：Node 无依赖直接导入真实 ThreadAttention 的上述纠正/去重/待答行为断言，全通过；`node --check validation/m2/attention.mjs` 和 `node --check validation/m2/package.mjs` 均通过。
- 已读取提交内 `attention-review-terminal-red.txt`、`attention-review-identity-visibility-red.txt`、`attention-review-fixes-green.txt`；红灯针对原缺陷，green 记录 38 项相关行为通过。完整工程记录显示 790 passed / 2 skipped，并包含各进程 typecheck 等。它们是主 Agent 保存的运行证据，不是本 reviewer 重跑门禁。
- `git diff --check` 只报告提交内原始测试日志末尾空行，未计为高价值缺陷，也未修改原始证据。
- 本次只写本复核报告；未安装依赖、构建、复制 App、修改源码/状态或提交。

## 未覆盖

没有在本 reviewer 环境运行 Vitest/React、完整工程门禁或启动 Electron；系统通知真实显示/点击、OS 权限/签名、实际后台关窗重开、主题密度视觉以及最终包内 metadata/app.asar/ZIP 同源由主 Agent 完成并记录。无依赖样本验证协调行为，源码与既有 Runtime 集成链验证可达性，不替代实际 SDK/macOS 送达证据或用户认可。
