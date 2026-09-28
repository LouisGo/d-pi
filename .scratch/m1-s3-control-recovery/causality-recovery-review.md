# S3 因果观测、prepared 恢复与退出复核

2026-09-28，基线 `2008d59`。用户要求独立复核新 review，修复已证实及相邻必修问题，解释此前遗漏原因，完成一次本地 commit；不推送、不实施 S4。沿用 D-21/D-22/D-24/D-29/D-35 和官方 SDK 所有权。

## 独立判断

新 review 三项成立，且是不同的行为缺口；上一轮实现有效，但其“可进入 S4”结论不足以覆盖这些反例。附件的反例脚本链接不是本机已执行证据，本轮在仓库真实调用链另写失败测试复现。无需重选技术栈或建立全局事件平台。

1. **旧空闲观测能错误收束真实在途提交。** NativeSession 在同一次解帧内 resolve 请求后继续观察 agent_start/ACK，Promise 续体稍后运行。旧 get_state 可以覆盖更新的活动。另有派发前控制快照晚到 Main 的窗口；只给查询加版本不足以阻止 Main 提前删除 executingIds。
2. **prepared 持久化后 Renderer 重建缺恢复出口。** Main/原生仍存活，原草稿版本被正确冻结；新 Renderer 新建 ID 被防重约束拒绝。数据没丢，但原发送意图走不下去。
3. **原生退出与传输不可用被混同。** 空闲原生已死而 utility Host 留存，Main 的保守 busy 和再次向死进程查询让正常 Quit 无法结束。这与 issue 09 非空队列放弃无关。

## 修复与相邻检查

- Host 以局部 observationVersion 废弃被派发、原生活动、交互或更新控制越过的异步状态响应；合并并发刷新，只发布当前有效观察。Main 收束还要求 Host 的新鲜 idle-confirmed 与当前 connection generation、最近派发 ID 匹配，并核验 busy/队列/后台/交互等既有条件。ACK 只是调用确认；查询发生在 ACK 前时不能生成其后可复用的空闲证明。
- 用户明确选择 prepared 的**显式继续发送**：提交记录中增加操作，复用原 ID，Main 重新核验授权、目录和目标，不自动派发、不放松 SQLite 同版本防重。只有草稿版本、正文及编辑序列仍匹配才恢复清稿关联；后来输入 B 保留。对 retryOf 的 prepared 不恢复清稿关联，保持“再次发送不消费当前草稿”既有语义。
- NativeSession 独立报告真实 child close，即使此前已出现 protocol/write 断链；Host 据此清理并结束自身。Main 保留真实在途、队列、后台或交互的未知状态；单纯传输不可用不视为进程已死，不放行退出。
- 举一反三发现退出最后一步也会受旧观察影响：close-idle 等待状态响应时若出现更新活动，必须拒绝本次关闭并刷新，不能据旧 idle 终止正在工作的原生进程。该路径与提交收束一起补因果保护。

## 为什么前几轮漏掉，而这次 review 能找到

这是基于源码和测试替身的证据解释，不猜测评审者心理：

- **边界选高了一层。** 上轮跨真实 Host/Main 的测试替换 NativeSession，把“同批解帧同步通知 + Promise 续体延后”抹掉了。增加同类高层测试数量也不能找出这个竞态。本轮从 stdout 字节经过真实 FrameDecoder、NativeSession、Host、Main 到 SQLite 验证。
- **把收束前提当成既定正确。** 过滤 disconnected 的 executingIds 本身合理，但它依赖“何时移出集合”正确。上轮着重断线后的影响范围，没有反向审计删除身份的观察证据。现在对不可逆收束及退出都追问：这份 idle 属于哪次派发，有没有被更新活动越过。
- **单调事实与会过期观测没有分开。** ACK/失败适合单调合并；busy/连接不能照搬。Renderer revision 也无法修复上游已经应用错的状态。此次 review 直接沿时间顺序构造反例，因此能穿过静态所有权审计留下的空隙。
- **持久化不等于恢复可操作。** rejected/unknown 已有出口，prepared 被当成正常流程的短暂中间态。此前只验证恢复“读到了什么”，没有从每个持久非终态追到用户“下一步能做什么”。本轮保持 Main/SQLite 存活，在 prepare reply 返回前销毁 Renderer，再通过显式操作验证。
- **进程层级被替身合并。** Host exit 不等于 native child close，断链也不等于进程终止。本轮分别覆盖协议损坏、随后真实 close、空闲退出及带在途退出。

后续不增加形式化审计轮数：凡用状态观察进行不可逆操作，测试时间交错和观察适用范围；凡新增持久非终态，写出恢复后的用户出口；凡跨进程故障，分别核对每层存活和清理证据。架构边界正确仍需要这些行为证据。

## 验证与限制

- TDD：同批旧 idle/agent_start/ACK、派发前控制帧、空闲 native close 的反例先红后绿；Draft 恢复、真实 Main/SQLite 与 Renderer 重建、retryOf 清稿防护分别先红后绿。补充未 ACK 不能生成空闲证明、协议损坏后真实退出的回归；close-idle 的旧观察反例也先红后绿。
- `pnpm check`：129 项测试通过，1 项既有可选 smoke 跳过，类型、Biome、设计 lint 与边界检查通过。`pnpm build` 通过。输出见 [check](evidence/causality-check.txt)、[build](evidence/causality-build.txt)、[GUI/SDK](evidence/causality-gui.txt)。既有可选 CLI smoke 保持跳过；构建的大 chunk 提示不代表性能验收。
- `pnpm exec electron validation/s3/app-recovery.cjs`：真实正式窗口、Main、Host、固定官方 SDK、本地 HTTP 模型，在隔离临时配置执行。持久 prepared 后 reload Renderer，未点击前模型请求数为零；正常/紧凑切换后明确继续，只有一次请求、同一个 ID 获 ACK、原草稿被消费；再让空闲原生真实退出，普通 App Quit 成功。exit 0。此检查通过 preload 准备故障窗口，不声称真实 OS 崩溃复现；销毁重建与未回 reply 交错由集成测试覆盖。
- 不重复完整打包/性能/故障矩阵，不使用个人凭据或真实供应商费用；旧候选包不含此修改，用户试用未获认可。新按钮沿用共享 Button、无新样式/token；自动密度切换不能冒充主观视觉验收。

## S4 进入判断与试用

本轮已证实的三项及退出查询同类缺口关闭后，**未发现仍须阻断 S4 开发的已知问题**；这是上述边界和证据范围内的工程判断，不是零缺陷保证，也不授权提前实施 S4。issue 09 的非空队列放弃继续待产品决定；冷恢复无单写证明仍只读，unknown 仍不自动重发。

从当前源码 `pnpm runtime:sdk && pnpm dev` 试用。若窗口重开出现“已保存，未派发”，展开“提交记录”并点击“继续发送”；已保存原文将按原 ID 重新核验后派发，新输入不受影响。若目标/权限已失效会明确拒绝，不能用该入口绕过恢复门槛。S4 自身的读取权限、symlink/句柄、Git 外部执行边界仍需自己的规格与验证。
