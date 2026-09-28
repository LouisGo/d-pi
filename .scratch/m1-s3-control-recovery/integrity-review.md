# S3 跨层收尾与 S4 进入复核

2026-09-28。基线 `1661361`。用户要求修复复核前三项、举一反三处理必须现在修复的相邻问题，退出问题先记录；完成后一次本地 commit，不推送。本轮不实施 S4，不重选技术栈，不改变官方 SDK。

## 本轮结果与所有权

1. Renderer 观察到明确 rejected 后，按 submissionId 释放对应 Draft 捕获；原文、revision、撤销历史不变。旧拒绝不释放新捕获，unknown/普通 error 不放行。实际 Renderer 功能对象→Main→Host 的交互竞争用例证明原文不编辑即可新 ID 派发一次。
2. Main 以已有 executingIds 决定 disconnected 影响范围。Host 的 15 分钟关联保留仍用于迟到真实 ACK/error；不引入第三份生命周期状态。A 收束→B 在途→NativeObservation disconnected→真实 Host→Main，仅 B 变 unknown；迟到真实 error 仍能更新 A。
3. Main 准备/派发与 Host 原生写出前共用窄命令策略，拒绝 move、wt/worktree 和 session delete。使用固定原生大小写/空白/冒号规则，拒绝消息明确，普通发送/干预/显式 resend 共用边界；旧 prepared 也不能绕过。App 不事后自动接纳原生迁移、不偷偷更换绑定。
4. 相邻必修：prepare 后撤销授权、目录替换/不可识别，派发前校验失败也必须持久 rejected；先禁用准入，再由 coordinator 重读收据，避免并发已派发被改写为未派发。存储失败仍不伪报拒绝成功。
5. 相邻必修：毫秒时间戳不是 IPC 因果序。Renderer 合并保持 rejected/ACK/failed/unknown 已观察事实；有效迟到 ACK 可更新调用确认，不能抹掉已知失败或未知结果。旧 request reply 不回退已观察事件。

## 原生命令证据与排除项

固定依赖 `@oh-my-pi/pi-coding-agent` 18.3.0：RPC `rpc-mode.ts:1200` 调 headless builtin；`builtin-lifecycle.ts:735–785` 有 move/wt/worktree；`builtin-session.ts:231–260` 的 session delete 调 dropSession，后者关闭 writer 并删除会话及 artifacts。后者是本次举一反三发现、与原三项同批关闭的高优先级入口。

顶层 delete/new/clear/resume/fork/branch/rewind/tree/quit 等仅 TUI handler，不能声称已经通过当前 builtin RPC 路径开放；普通文本仍可进入扩展/模型，不是安全沙箱。fresh 清理 provider stream，不改变会话绑定。add-dir/remove-dir 不改变主 cwd/session file，本轮没有把它们扩为必须封禁项。策略保护已知 App 身份边界，不宣称审计了任意受信任扩展/工具副作用。

## 为什么之前多轮 review 仍然漏掉

以下依据仓库测试、源码和交接记录，不猜测先前评审者的思考过程：

- **测试终点早于用户目标。** 旧回归证明 Main 接受新 ID，却绕过会阻止下一次点击的 DraftController。数据库“允许重试”被推成用户“可以重试”。本轮把不编辑正文再次发送作为终点。
- **替身合并了不同故障路径。** 旧测试直接 emit Host exit；真实原生断线先由 SessionHost 产生逐请求事件，再通知 interrupted。前者不触发关联缓存重写。本轮在原生观察边界注入故障，穿过真实 Host 和 Main。
- **所有权审计没有穷举改变事实的入口。** 确认了 App 管身份、OMP 管执行，但 prompt 同时是命令入口。只核对顶层 delete 仍会漏掉 session delete。现在沿实际 headless handler→副作用追踪，不凭名称判断能力，也不把官方能力当 App 已承接。
- **局部修复未检查邻接转移。** 新增 rejected 后，需要同时追所有“确定未派发”的出口及全部消费者；授权/目录校验在 coordinator 之外，旧路径继续抛错。异步收据合并只测先后时间不同的样本，又遗漏同毫秒事件与请求响应交错。
- **结论强于证据。** 上轮测试通过证明的是指定入口，不能推出完整体验闭环或“无任何 S4 前置问题”。本轮保留旧证据，明确更新结论，不改写历史验证结果。

以后同类改动在对应票中回答三件事即可，不加一套流程平台：事实由谁改变、还有哪些入口能改变它、用户下一步是否通过真实调用链可完成。状态新增时追生产者和消费者；边界缺陷优先保留跨真实对象的反例测试。架构审计继续用于所有权和依赖判断，不能替代这些行为证据。

## 验证与限制

- TDD：原文 rejected 重试先失败（只产生一次 prepare）；真实 Host 断线先失败（A outcome 被污染）；四类命令先失败（prepare 返回 receipt）；派发前权限/目录三个场景先失败（throw）；三类同毫秒旧响应先失败（状态/结果回退），然后分别最小修复。补充跨完整功能对象的集成检查直接绿灯，未冒称其历史红灯。
- `pnpm check`：类型、Biome、设计 lint、边界检查；114 项测试通过，1 项旧 CLI 可选 smoke 跳过。新增/修改用例覆盖真实 SQLite 与真实功能对象；原生传输替身不冒充真实 SDK。
- `pnpm build`：通过，保留既有 Zod 注释和大 chunk 提示。
- `pnpm exec bun validation/s3/command-policy.mjs`：15 个样本与固定官方 parser/alias/headless registry 一致，不执行危险 handler。
- `pnpm exec electron validation/s3/app-command-boundary.cjs`：正式 GUI/Main/Host/官方 SDK 检查通过，exit 0。先正常发送形成真实会话历史，再经 GUI 拒绝 move、wt/worktree、session delete；草稿保留、历史字节及绑定不变；随后普通文字在同一会话获得持久 ACK、写入历史并正常退出。隔离临时项目/配置/本地 HTTP 模型，不使用个人凭据和外部供应商。当前机器首次缺少 resources/sdk，按现有 `pnpm runtime:sdk` 重建后通过；初次失败归因于资源缺失，不是生产回归。
- 可复查输出：[check](evidence/integrity-check.txt)、[命令策略](evidence/integrity-command-policy.txt)、[GUI/SDK](evidence/integrity-gui.txt)。独立只读生产 diff 复核未发现新增必修项，`git diff --check` 通过。

不重复 S3 完整故障/打包/性能矩阵；没有真实供应商费用、中文 IME、干净机器或用户体验认可的新结论。退出问题见 [09](issues/09-quit-discard-decision.md)，本轮只记录。旧 `dist/s3-candidate` 不包含这些改动，不得用于本轮验收。

## S4 继续边界

**可以安全进入 S4 工程开发：本轮已证实的提交、断线与会话身份前置缺口已关闭，07/08 工程交付完成。** 该结论限定于已核对的边界和测试，不是对未知缺陷的零风险承诺，也不是 S4 实现授权或验收。冷恢复缺单写证据继续只读，unknown 不自动重发。退出暂停队列的产品选择允许与 S4 独立推进，下一次试用交付前回看，不称其已修复。

S4 自己仍需 spec 与授权读取/symlink/句柄复核、只读 Git 外部 diff/textconv 限制、选区内容及来源版本冻结、Monaco worker 的针对性验收。本轮不提前实现这些，也不把 S3 收尾推成 S4 已验收。试用从当前源码 `pnpm dev` 启动；用户试用仍待反馈。
