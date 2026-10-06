# 首次真实供应商 GUI 闭环（2026-10-06）

此前本会话各切片的模型生成验证使用 localhost 测试供应商；实际 Electron、Main、SessionHost、固定 OMP SDK 与原生窗口均有验证，但未调用用户账户取得真实模型回答。历史 fixture 证据不改写。

本轮用户明确说明本机 OMP 的 GPT Luna 可直接调用，并要求独立 Thread 返回真实回答；本轮据此执行一次最小真实生成。没有新增认证、导出凭据或修改全局模型默认值。

## 候选与隔离

- 正式候选：`0.1.0-m2.20 / 3c4c1060-8b550d60`；产品源码 `3c4c1060cd7943cb435ac73da3d8bd03433d4954`。
- 原包与独立测试副本的 `app.asar` SHA-256 相同：`8c51f1427708aa82d2cde00b9563a6780de5a13fd44f7d8143c354da74907231`。副本仅更改 bundle identifier，独立 App 数据、空白临时项目、新原生会话；保留窗口供查看。
- 配置：沿用本机 OMP 原生配置与已有认证。只读快照禁止网络，coverage=complete、issues=[]；默认 `openai-codex/gpt-5.6-luna:high` 可用。启动后的 GUI 与原生消息共同确认 `openai-codex/gpt-5.6-luna`、`high`。
- 没有启动 fixture 供应商、注入固定回复或复制用户凭据。App 数据隔离不等于 OMP 认证隔离；此次真实请求按用户本轮授权复用认证。

## 实际 GUI 路径与结果

Computer use 操作打包候选：打开项目 → 原生目录选择器选择空白项目 → 创建独立 Thread → 允许执行并启动 → 原生模型/档位就绪 → 编辑器输入 → 点击发送 → 在会话阅读区确认真实回答及完成。

Thread：`a64488ec-21a2-492b-bd83-8fd1408e5aab`；原生 session：`01a11151-3fe3-7000-ac5e-2e9891720ec6`。

请求：`这是 d-pi 真实模型端到端验证。不要调用任何工具，不要读取文件。请用一句中文回答 2+3 的结果，并在末尾原样附上验证标记 DPI_LIVE_20261006_6VbAgQ。`

真实回答：`2+3 的结果是 5。DPI_LIVE_20261006_6VbAgQ`

App SQLite 只有一条 submission，原生历史只有一条 user 和一条 assistant，没有 toolCall。收据 state=acknowledged、outcome=completed，native-prompt-result 的 agentInvoked=true、sessionSettled=true；GUI 收到 session_settled 后回到 OMP 已就绪。提交至完成约 6.844 秒。原生 usage 为 input=6132、output=71、totalTokens=6203（其中 reasoningTokens=42）；不是账单或费用结论。

submissionId：`2f171dca-4592-4c10-a94b-ad9cfba9a0ea`；traceId：`d8f2ce90-fc5b-49c7-9d81-b10d2f49ab20`。既有日志同 trace 覆盖 prepared → dispatching → acknowledged → completed outcome；多个状态观察记录不等于多次发送。未抓取网络层请求数，计数只声明 App 与原生历史观测。

## 可复查证据与限制

[GUI 截图](evidence/real-provider-2026-10-06/gui-answer.png)、[GUI AX](evidence/real-provider-2026-10-06/gui-answer.ax.txt)、[结构化结果及断言](evidence/real-provider-2026-10-06/result.json)、[同 trace 日志](evidence/real-provider-2026-10-06/submit-trace.jsonl)、[有限配置元数据](evidence/real-provider-2026-10-06/configuration-safe.json)。证据不包含凭据、原生 thinking 文本或个人旧会话。

此次已证明现有 OpenAI 认证 → 新 Thread → 真实 Luna 生成 → GUI 阅读 → 收据/原生历史持久化的基本链路。未验证新增登录、DeepSeek、工具执行、附件、多 Thread 真实生成、异常/长时间组合或冷执行恢复；不关闭 02/03/06 全部范围，不代表 M2 完成或用户认可。未改应用源码，不需为已有正确行为伪造 TDD 红灯或重跑无关全量测试。
