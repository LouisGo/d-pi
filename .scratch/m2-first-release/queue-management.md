# M2 原生队列管理

日期：2026-10-02。当前用户授权恢复中断后的 M2 开发，沿用 D-11/D-24/D-21/D-22；不改变 OMP 队列所有权、unknown 不重发、冷恢复只读或退出放弃待决。共享 Host/公共协议/Main/Renderer 由主 Agent 接线，本记录维护专用原生适配和验证。

当前结果：[05a](issues/05a-native-queue-management.md)的纯文本增量工程已resolved，正式应用链路已接线；父[05](issues/05-queue-subagent.md)的完整范围未因此完成。本文记录当前工作树与当轮固定资源的工程证据，不代表新正式候选交付、真实模型账户或用户认可。完整附件/引用重准备和custom编辑继续留在04/05。

## 固定源码事实

- 固定官方 `@oh-my-pi/pi-coding-agent` / `pi-agent-core` 18.4.6。Agent 的 `peekSteeringQueue` / `peekFollowUpQueue` 包含尚未 commit 的 claimed 原始对象；`replaceQueue` 单队列原子替换、取消该队列的旧 preparation 和 pending delivery，避免幸存前缀重复消费。
- `agent.prepareQueuedMessages` 为公开接入点，AgentSession 已设置其自己的异步 before-agent-start preparation。适配保留调用并在其前、后按正在编辑的实际对象等待，不能替换掉原生准备。原生 commit 仍同步验证 claim 和 abort signal。
- 原生 `session/queued-messages.ts` 区分用户消息、隐藏 companions、agent 内部消息；删除/重排以原生对象和 companion group 为单位，不按文本区分重复项、不删除旁边无关内部记录。
- 原生 dequeue hook 不携带 queue kind；把逐项编辑原因放到全局 hook/model-call gate 会提前阻塞其他项或当前执行。这里仅包裹匹配编辑对象的 queued preparation，不注册 model-call gate。
- 原生队列模式默认 one-at-a-time，但配置可覆盖成 all。本次保留用户原生模式：one-at-a-time 下，前项可继续执行；all 下，原生合并批次只要包含编辑项，整批等待保存/取消，不承诺批次中前项逐条先行。GUI明确说明批次等待，SDK 原有 hidden companion grouping 保留；不无提示覆盖用户配置。

## 专用模块与接线

`runtime/native-queue.mjs` 的 `NativeQueueManager(session, helpers)` 持有当前原生实例的身份镜像和未保存编辑稿，无第二份自动消费队列。`helpers` 传独立 `ConsumptionGate` 与官方 `isUserAuthoredQueuedMessage`、`isHiddenUserCompanion`、`queueChipText`。

`snapshot()` 提供 revision、真实待处理 items、editing `{entryId,draftText}`、coverage 和 hiddenCount。UUID 来自实际原生对象 WeakMap；同文重复项不合并。`execute` 接收 begin-edit / update-edit / save-edit / cancel-edit / delete / move，版本与目标仍待处理均在执行方验证；操作失败抛有限机器码，不靠原生错误正文匹配。

关窗/Renderer 卸载不能调用 manager.dispose；编辑稿、消费暂缓及原生实例保持同一 owner。只有明确保存/取消解除 queue-edit 原因，用户停止原因仍由现有独立 stop gate 持有。保存先原生同步替换，再解除编辑原因；编辑失败仍保留待处理旧内容和编辑稿。

单项可编辑 JSON 编码文本预算 256 KiB；快照整体 <=512 KiB、最多128项。表示超预算的项保留身份但截短显示、truncated=true、editable=false；更多项由 hiddenCount 明示。真实原生内容不截断、不清理。当前编辑支持无 companion 的纯文本 user；图片、附件/引用 companion 和 custom 变换条目标不可编辑，仍可原生删除/重排，完整附件重准备/编辑仍为04/05未完成范围，不能声称 M2 完整队列已验收。

正式链路为Renderer `RuntimeModel.manageQueue` → Main `RuntimeService` → Host/NativeSession受限命令 → `d_pi_queue`。Host解析queueState与实际响应，Main再次校验信任、真实实例与revision，保留同一trace；并不按投影变化、同文或队列长度推定修改成功。宿主旧preview已额外收紧到16项/512字符，与512 KiB队列快照共同留在物理帧预算内。

Main `QueueChangeRepository` 在save/delete/move派发前写独立变更记录，包含traceId、Thread、完整native target、entryId及revision、操作和previousText。原冻结提交与发送收据不覆写。previousText来自受限投影，`previousTruncated`明示是否仅为片段；不能将它冒称完整原生待处理正文。删除/重排依旧修改完整原生group。begin/update/cancel不新建持久QueueChange；未保存稿和暂缓由当前原生适配实例保持，故Host故障或真正退出不承诺该内存编辑稿自动恢复。

App数据库schema 7新增queue_change；v6收据先按既有保守顺序恢复，再生成before-v7备份、发布新版本。未决QueueChange重开变为unknown，已确认记录保留；不重写原生操作，不改变冷旧Thread只读。存储身份冲突或写前失败阻止派发，原生修改后确认持久化失败明确unknown。

## 定向验证

`node scripts/testing/test.mjs node tests/tooling/native-queue.test.mjs`：7/7 通过，测试通过项目隔离 runner；专用文件 Biome 通过。

前5项逐行为红 → 绿：

1. 原生身份/重复文本与隐藏项：初始 empty projection 因0项而非2项失败；实现对象 UUID 后通过。
2. 进入编辑暂停匹配 delivery：原 begin-edit 未改变 editing 状态失败；前项继续、编辑项等待、取消恢复原对象后通过。
3. 未保存稿与保存：update 未保存新稿失败；Host 实例保存draft，新内容替换原生待处理项、不改兄弟项后通过。
4. 删除/重排：未支持动作抛 invalid-operation；原生 companion group 一起移动/删除、旧版本/已消费目标拒绝后通过。
5. 有界表示：最初没有 coverage，随后整体编码预算超标；调整元数据保留后完整预算和原始内容不变断言通过。

另2项为既有实现回归，未制造红灯：SDK preparation await期间进入编辑也必须等待；abort不能丢未保存稿；空稿可保留但保存拒绝且原生锁不解除。

真实 SDK/localhost 路径 `node validation/s3/sdk-queue.mjs` 已通过正式更新后的 `resources/sdk/host.mjs`（官方固定18.4.6，独立Bun/临时HOME/原生配置/project/session、localhost Provider）：

- 同一session真实8次模型调用。one-at-a-time下，当前FIRST不因编辑暂停；A先执行，编辑B实际等待、C不跳项；原生删除/重排、未保存稿/取消恢复、save保留独立停止原因、continue执行B_NEW/C通过。
- 用户原生all模式保留，整批含编辑B时阻止commit；分别cancel/save后，各原合并批次一次消费A/B/C，实际请求包含原文或新文本；两条原生隐藏ultrathink-notice随原批次message_end进入历史，不丢companions。
- 首次fixture的notice断言失败：官方follow_up入口不触发magic keyword，并非适配丢失；改用真实生产prompt+streamingBehavior:followUp路径后通过。该失败与生产缺陷红灯分开记录。

## 正式 React 接入

新增 `src/app/renderer/workbench/queue-controls.tsx`，由主Agent接入RuntimePanel，语言catalog由主Agent统一维护。组件只订阅queueState/queueOperation/可用标量；显式身份区分同文条目。begin-edit原生确认后出现编辑器，逐change发送update-edit，保存带最新视图输入；RuntimeModel排队并按实际发出时宿主revision接线。Native宿主稿是重挂载来源，视图即时输入不会被旧ACK倒退。视图卸载无cancel/dispose；unknown禁写并提供inspect，不自动重发。

`node scripts/testing/test.mjs vitest src/app/renderer/workbench/queue-controls.test.ts` 4/4真实React挂载通过：重复文本身份/受限编辑；确认编辑、输入更新与保存对应原生项；宿主稿重挂载且卸载零取消；pending禁写、unknown仅inspect。前2个UI缺口（重复项显示、宿主稿重挂载）有真实失败→实现→通过记录；其余为既有实现回归，不制造红灯。`pnpm lint:design`、专用文件Biome及统一catalog接入后的 `pnpm typecheck:renderer` 通过。

真实账户、供应商付费、macOS视觉/原生关窗和用户认可未纳入本子任务证据。React重挂载证明组件不释放宿主状态，不单独冒称真实红色关闭按钮或断链恢复已验收。

## Renderer 写入 lane 与核对后继续（同轮接续）

`queue-write-lane.test.ts` 使用真实 RuntimeModel 和受控桥接：快速update按前次ACK新revision串行派发、save等待最后draft；lane跨bind不把旧文本投向新Thread；同Thread新连接不会被旧reject改成unknown。以上是原实现正确行为的回归覆盖。

新增实际失败→最小修复→通过：旧连接的成功回复带较大view revision会覆盖同Thread新代次，现成功/失败均核对当前代次，成功还核对reply代次；cancel排在更新ACK后曾仍带旧编辑revision，现update/save/cancel共用同edit的新确认revision（begin/delete/move继续用用户看到的版本）。

unknown操作保持原历史状态、不重放。只有Main明确inspect实际Host并置`reconciled:true`之后，Renderer解锁新的明确操作；manageQueue和QueueControls最初都永久锁unknown，新失败测试后修复。UI区分“尚未核对”与“已核对但原结果仍未知”。新增唯一文案key `queue.reconciled` 交主Agent统一catalog接线。

定向检查：lane 6项、原RuntimeModel 5项、QueueControls 5项，共16项通过；相关Biome与设计lint通过。schema `reconciled` 与统一catalog已接线，`pnpm typecheck:renderer`通过；不以UI模型测试冒充真实Host核对条件通过。

收口时实际SQLite检查：QueueChangeRepository 9项、QueueChange重开集成1项、schema 7/真实v6升级与before-v7备份2项，共12项通过。覆盖事务/身份冲突、旧冻结提交不回写、dispatching重开unknown、已确认记录保持与升级恢复顺序。相应模块文档更新后`pnpm check:documentation`通过（242份当前Markdown、17份历史快照排除）；完整工程检查与最终候选身份由主spec维护。
