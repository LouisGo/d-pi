# 固定 SDK 接入证据（2026-09-30）

来源：本轮未修改的官方 OMP 18.3.0，Bun 1.3.14；开发 Node 24.21.0 / pnpm 10.5.2，macOS arm64。资源由锁文件、已安装依赖与 App 薄宿主 `pnpm runtime:sdk` 生成（176 依赖单元），不是全局 OMP。

运行：`D_PI_NATIVE_EVIDENCE=<仓库>/.scratch/rewrite-preparation/evidence/sdk-control.frames.jsonl node validation/s3/sdk-control.mjs`，可通过 `SDK_ROOT` 指定独立资源。App/OMP 配置、会话与项目全部在临时目录，子进程使用显式环境，仅本地 HTTP provider fixture 与测试凭据。

实际结果：停止保留原生 follow-up；较新停止压过未处理 continue；显式继续在同一 session 只消费一次；最终所有活动字段为 false/0、队列为空。13 个 response 及 agent/message/control 等帧保留原始 ID、顺序和字段，样本见 `sdk-control.frames.jsonl`。该文件是 SDK 发出的真实事件，模型响应由本地 fixture 合成；不能冒称真实供应商、凭据或用户项目样本。

标准回放：`pnpm test tests/integration/native-evidence-replay.integration.test.ts`。按 31 字节碎片重走生产 FrameDecoder 与 ConversationProjection，验证 ACK、被压过的 continue 失败、正常 continue 成功、SECOND 原文和完成 RESPONSE；通过。已有正确边界补测直接绿灯，不声称历史 TDD。

接受后异步失败：`D_PI_NATIVE_EVIDENCE=<输出> node validation/s3/sdk-failure.mjs`。独立 App/OMP/项目环境、没有凭据的 localhost 模型 fixture；官方 SDK 先发 `prompt success: true`，再以相同 request ID 发 `success: false`（No model selected），provider 调用数为 0。[原始帧](sdk-failure.frames.jsonl)按 7 字节碎片重走生产 Decoder，保持两条不同事实；不因收到首条成功而丢弃后续失败。该样本是实际 SDK 预检失败，不是供应商执行故障。应用收据的 ACK 后 failed/unknown 和草稿消费事务由相关集成回归另证。

独立核心审阅的必要补修：开放工具开始事件的额外 `isError/result` 未认证，旧 projection 曾按 truthiness 制造失败与正文。新增负例真实红→绿后只在已认证的 tool end 分支消费这两字段；固定 18.3.0 agent-core 的 tool end `isError` 是 optional，保留该合法形状并直接补绿色兼容测试。未改官方 SDK，也未将未消费的额外字段升级成必要 payload。

未覆盖：真实供应商 ACK 后异步故障与工具修改、个人扩展、冷恢复全周期单写、真实用户试用。协议单元样本及故障注入与此真实 SDK 样本分别记录；不自动重发 unknown，不解除冷恢复只读。GUI/随包完整路径在 07 中另记录。
