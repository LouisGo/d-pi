# 会话组件体系：实施与交接

## 推进与交接

2026-10-11 用户授权当前目录直接实施 WB00、WB01，起点 main `78d4f73`。后续会话先读[完整原方案](../../docs/product/session-components-plan-2026-10-11.md)和本文件，再补目标合同/源码。本文件是 WB00–WB08 唯一实施跟踪；原方案保留原始研究正文，其旧基点审计不是当前事实。本轮不实施 WB02–WB08，不推送远端。

原文 SHA-256：`19fa801aa4589a54b9d2e42213cbeac0e1f4c0c8d239d90b133c53aba4771bfa`。工程、试用、用户认可独立；本轮尚在实施，未宣称 GUI 或用户认可。

## 工作包

| ID | 依赖 | 状态 | 验收条件 | 验证证据 / 下一步 |
| --- | --- | --- | --- | --- |
| WB00 | 当前运行基线 | in-progress | 18.8.9 实际依赖；A/B 回答独立结果；同目标单次发送；草稿跨卸载；代次隔离；written 与原生结束分开；stop 独立 | 先冻结操作/交互合同，再失败回归与实现 |
| WB01 | WB00 | planned | 命令卡→实时详情→pin→切 B→明确 B 草稿引用→回 A 原成员；有界摘要、final 对账、coverage、关闭释放、旧导航不抢占；键盘入口 | 先定义 Source/Surface/reader/FrozenContext，再生产装配与组合验收 |
| WB02 | WB01 | planned | 活动组、常用 read/search/edit、轮次、变化摘要真实 | 后续授权与语义契约 |
| WB03 | WB00；联调 WB01/02 | planned | demand/范围读取/字节缓存/Worker/Viewer/native warm 有界 | 后续性能预算及资源策略 |
| WB04 | WB00、WB01 | planned | 多题/权限/超时/unknown/回答历史完整 | 后续原生 ask bridge 与 DecisionDock |
| WB05 | WB01、WB03、WB04 请求事实 | planned | 任务→子代理→Job→使用量/策略/资源 | 后续真实 owner scope 合同 |
| WB06 | WB01、WB02、WB04 | planned | Plan 到安排执行；Diff/消息反馈；精确分叉 | 后续原生能力与反馈协调 |
| WB07 | WB01、WB02、WB03 | planned | 搜索定位与专业 Body 复用来源/详情/资源 | 后续专业结果合同 |
| WB08 | 真实需求和能力协议 | conditional | 独立外部资源能力可验收，不阻塞核心 | 终端/多窗口继续沿用各自授权，附件计划不构成授权 |

## WB00 当前复核

- 仍存在：RuntimeModel.request 共用 requestGeneration，较早回答失败可被较晚独立动作丢弃；NativeInteraction 的 value/selection/sent/answered 和 RuntimePanel followUps 归 React，切换丢失。
- 已升级项：package.json/lockfile 为 OMP 18.8.9；复用[升级规格与证据](../omp-sdk-1889/spec.md)，继续核对已安装 SDK 与资源 manifest，不重复全套升级验证。
- Host PendingInteractions 已按题目单次准入；本轮保留并补精确结果关联。普通 answer 的 acknowledged 仅本地 write 无同步抛错，需改名 written；SubmissionReceipt ACK 不变。
- WB02/03 审计（全文传输、历史字节预算、后台 demand 等）不在本轮重复审计或冒称修复。

## 先行合同与拥有者

- RuntimeView 只表示最新运行事实，operation 按 traceId、Thread、连接代次、kind、requestId 关联；不以 view revision 或其他操作淘汰独立结果。Main 等待具体 Host operation-result，Host 兜底原生单次发送。
- Thread-owned RuntimeModel 拥有交互草稿、选项、follow-up 收据关联与操作观察；React 只订阅和编辑。not-dispatched 可编辑重试，dispatching/written/unknown 锁住原回答；原生结束独立显示。仅保留当前连接最近有界题目与历史，旧代次不复用同 ID；持久完整回答历史在 WB04 处理。
- 窗口拥有 Surface/导航意图与详情读取 lease；Thread/Host 拥有执行，close 不取消命令。来源带 Thread、真实会话/连接/工具身份，live 稳定实体与内容版本分开；无法映射 native record 明示 live-only/partial。
- input 拥有 FrozenContext 编码与草稿语义插入；引用发起时捕获目标 Thread/draft revision 和内容版本，不从 await 后当前 Thread 取目的地。活动 editor 通过单笔 transaction 插入，未挂载 controller 语义插入；旧意图不可复活 Surface。

## 验证和偏差

按行为逐段 TDD：独立回答/双击/重连/重挂载，详情更新与final，跨Thread草稿/Undo/来源定位/lease释放与晚到导航。只跑相关类型、行为、边界和文档门禁；必要的真实 SDK/生产链路验收有界执行，不重复 provider/系统 IME 或包矩阵。

尚无实现偏差。待完成切片后追加实际命令、结果、提交、review 与未覆盖范围。

```project-status
[
  {
    "id": "session-components",
    "title": "会话组件体系 WB00–WB01",
    "phase": "M2",
    "engineering": "in-progress",
    "trial": "not-delivered",
    "acceptance": "pending",
    "next": "完成独立操作与首条工作台生产闭环",
    "evidence": ["../../docs/product/session-components-plan-2026-10-11.md"],
    "constraints": "本轮仅 WB00、WB01；后续先读完整方案与本跟踪文件"
  }
]
```
