# S5 M1 组合工程验收

2026-09-30。当前授权范围已完成工程检查，候选交付待试用，用户认可未取得；不是 M2 全量验收。源码与包身份见 [最终 artifact](final-artifact.json)，当前状态单源为 [spec](../spec.md)。

## 来源与层次

起点为干净 `c631e455`。读取当前 AGENTS、CONTEXT、产品术语、决定登记、看板、基建交接及 S1–S4 规格/证据后开展组合实施。历史用于合同和测试路由，没有重做基建审计；固定 SDK 未升级。App 数据、HOME/OMP 配置与会话、Git 配置和项目均隔离，不继承个人凭据。

- 确定性 localhost provider 只负责协议响应；包内官方 OMP 18.3.0/Bun 1.3.14 真实执行、工具、交互、队列及历史。没有真实供应商账户或费用授权，因此不声明供应商通过。
- [完整工程检查](check.txt)：六个类型入口、Biome、设计/i18n、文档、架构及生成报告通过；Vitest 70 文件 399 项，1 个历史 CLI opt-in smoke 跳过；架构 32 项、tooling 40 项。两项行为修复已在这轮完整检查内；之后生产源码只更新 S5 显示标记，最终构建与快检通过，不重复无关矩阵。
- [定向跨对象回归](combination-regression.txt)：9 文件 64 项。源码路径已迁移，命令中旧路径参数未形成文件测试；文件/Git 实际负例由完整 check 中的 `project-files.test.ts` / `project-git.test.ts` 覆盖，不能把旧命令参数算成额外通过。
- [冻结补修审阅](frozen-review.md)没有可行动缺陷，独立 34 项通过；[验证入口复核](harness-review.md)两项发现均关闭，最后新增公开 bridge 样本只读复核无新增问题。审阅与 GUI 证据分开。

## 组合选择与实际结果

| 场景 | 本轮证据与复用范围 | 结论和限制 |
| --- | --- | --- |
| A1 正常提交/回答/继续 | [最终包结果](final-s5-result.json)、[原生会话](final-native-session.jsonl)、[Main 阶段日志](final-s5-main.jsonl)：两轮正常提交及真实 write，调用收据和 Thread/会话/target 身份保持；后续队列消费一次 | localhost 共 6 调用；不以 ACK 宣称业务接受或执行完成 |
| A2 派发前失败 | 已有 submission-coordinator 跨对象回归证明落盘失败不写原生；真实 React 提交列表显示 7 类已报告原因。最终包 prepare→pause→dispatch 经公开 bridge，被 Main 在写前拒绝，ACK null、无新调用、草稿原文保留 | Main 未报告 Host 原因时保留通用反馈。包内实际 DOM 核对通用文案；[截图](final-s5-paused-rejection.png)记录保留草稿，未把不可见的记录文案冒称截图可见 |
| A3 写后断链/unknown | 已有跨对象 ACK 落盘失败、旧实例 ACK 与 unknown 回归；最终包 ACK 后杀所属原生子进程，再冷重开 | 最后收据 acknowledged/outcome unknown，冻结引用仍在，6 次调用不增加；新包实际故障是 ACK 后中断，未重复所有前 ACK 崩溃变体 |
| A4 提交中继续编辑 | 最终包 ACK 后保留后来草稿并故障/重载，准备/迟到 ACK/error 与新版草稿用已有 prepared-recovery、runtime-host 回归 | 原文与新稿分开；未清空或覆盖后来草稿 |
| A5 停止、队列与待答 | 官方扩展四类交互 [答案](interaction-answers.json)；confirm 待答重载，草稿未派发；忙碌输入→排队→停止→重载→明确继续 | 同会话消费一次，停止保留/暂停；完整放弃退出缺口仍由 S3 09 持有 |
| A6 窗口/Host/OMP | 首轮包 Computer Use 实际 Cmd+W 后无窗口，通过完整测试副本路径 getApp 激活，引用与就绪状态保留；harness 重绑 renderer 核对同会话/无重发。最终包再次覆盖原生故障与同环境冷恢复 | 原生关窗证据来自前一构建 `12dddfb3-86d5de15`；与最终候选相关生产差异仅显示标记。Host 独立故障和旧代次依赖当前跨对象回归，未逐变体重跑原生进程 |
| A7 增量/水位/历史 | 当前 conversation model 的缺口重同步、旧端口/迟到快照回归；原生记录回放、忙碌历史保守反馈与包内实时/历史读取 | 不重复已有正确分页/竞态矩阵，不把可控样本声明为所有长输出路径通过 |
| A8 浏览/目录/权限 | [隔离试用](isolated-trial.md)实际原生目录选择，默认仅浏览且发送禁用；完整 check 的文件 symlink/FIFO/编码/版本竞态、Git filter 不执行、目录/准入边界；最终冷恢复不创建原生 writer | 文件可读和执行不可用分别表达，没有更换项目/会话掩盖恢复失败 |
| A9 可信 Diff/工具/引用 | 官方 write 有 toolCallId/原生记录 ID/结果；用户 Git 三侧来源独立，不归作者。权限位变化的同字节 Diff，复用同 Monaco 实例选右侧两次，得到 index 与 working tree 两来源及相同 sha256/原文。CRLF/CR/LF、磁盘刷新、语言切换、持久重载保持冻结引用 | [同字节来源](final-s5-same-byte-source-switch.png)、[空白 Diff](final-s5-whitespace-diff.png)已实际查看：两侧/行数/删除新增色块可见，空白变化未隐藏。没有工具前后全文则不绘制工具 Diff |
| A10 身份隔离 | 当前 Thread 投影切换、草稿/收据和迟到结果已有自动化回归 | 本轮不做多 Thread GUI，M2 未启动 |
| A11 新认证/附件 | 不在授权 M1 组合范围 | 不标支持、不继承个人配置、不提前实现 |
| A12 当前代表性负载 | 包内 20,000 UTF-16 草稿准确保存/重载，外观指令响应；真实 CDP composition 阻派发、代码阅读、主题/密度及诊断故障保守处理回归 | 系统 IME/原生 Unicode 粘贴、完整磁盘满/固定负载矩阵和性能对照未由本轮证明；不做效率提升结论 |

最终 [组合日志](final-combination.txt)退出 0，18 项检查通过；故意 App SIGKILL 是故障步骤，后续冷启动与 Browser.close 正常退出 0。包内最终 [结果](final-s5-result.json)记载源码 `4b003e84`、dirty=false、构建 `4b003e84-4c6aa4ad`，与 [资源哈希](final-artifact.json)一致。

## 未关闭及停止边界

[S3 09](../../m1-s3-control-recovery/issues/09-quit-discard-decision.md)的暂停非空队列放弃出口继续待决：不愿继续执行剩余输入时没有已认可的退出路径，因此完整退出验收不能关闭；本轮没有清队列或改退出策略。队列清空/空闲退出与取消退出、明确继续的既有工程路径不受此待决阻塞。

冷恢复缺执行全周期单写证明，继续只读；unknown 不自动重发。供应商、系统输入法手感、用户体验、签名/公证没有借 fixture 或 Agent 验证写成认可。完成当前授权后停止，不进入 M2/M3。

既有交互硬化 [03](../../m1-interaction-hardening/issues/03-dispatch-authorization.md)、[04](../../m1-interaction-hardening/issues/04-history-busy.md)、[07](../../m1-interaction-hardening/issues/07-quit-a11y.md)保持 open：其中包含撤回误报、尚需真实反例或用户影响的项，以及退出健壮性/焦点可访问补齐。本轮不做历史审计清账，没有把全体变体写成通过；剩余范围与影响在 [交接](../handoff.md)列出。
