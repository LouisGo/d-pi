# S5 验证入口独立复核

2026-09-30，独立子 Agent `s5_native_harness` 只读复核 `validation/s3/package.mjs` 的 S5 接入与实际失败后的脚本修正，以及 `validation/s5/trial.mjs` / README 的隔离启动、fixture 和同环境冷重开。

发现并关闭两项验证入口问题：

- 旧 CDP socket 的迟到 `onclose` 可能清空新连接的共享 pending 请求。inspect 与冷重开换连接前均解绑旧回调；此处没有在途请求。
- 试用第 4 步正常退出会让第 5 步的可选失败样本落在只读冷恢复后。正常退出移到可选失败样本之后。

独立复核确认关闭，未发现新增可行动问题。环境白名单、同环境冷重开及保留临时证据没有发现合同偏离。Node 语法、Biome、diff 检查通过；审阅者没有修改文件或运行 GUI。正式 GUI/原生通过情况另见组合结果，不能用静态审阅代替。

实际 harness 失败按阶段保留：

| 证据 | 原因与修正 |
| --- | --- |
| [IME 假设](harness-failure-ime-assumption.txt) | compositionend 不保证撤销组成文字。实际没有提交/provider 调用；改为核对完成且无派发，再显式清理测试草稿。不冒称系统 IME 通过。 |
| [阅读标签](harness-failure-reading-label.txt)、[历史标签](harness-failure-history-label.txt) | 旧 harness 使用基建术语迁移前的标签；按当前源码改为 `.conversation` 与“只读原生会话历史”，等待容忍尚未挂载。没有修改生产行为。 |
| [同一 range](harness-failure-same-range.txt) | 同字节切换保留 Monaco range，父组件清除待附入选区；再次 Cmd+A 选相同范围不生成新事件。测试先 ArrowLeft 改变 range 再全选，实际触发当前来源的选区事件，不通过测试钩子写生产状态。 |

五次运行是修正验证入口后的递进验收，不是冷启动评测或性能对照。第一次完整组合通过见 [原生组合日志](native-combination.txt)，源码构建为 `12dddfb3-86d5de15`；随后仅发布标记与验证入口补修，最终候选另记录其源码身份和运行结果。

最终候选补普通提交拒绝样本时，[首次失败](harness-failure-main-rejection.txt)说明预期错层：prepare→GUI pause→dispatch 被 Main 准入先拒绝，没有 Host reason。按当前合同改为核对实际 `rejected`、ACK null、无新调用、草稿原文不变及通用反馈；没有修改生产行为或伪造数据库。最终 [运行](final-combination.txt)通过，独立只读复核确认公开 bridge、身份绑定、generic fallback 和原模式隔离无可行动问题，Node/Biome/diff 通过。
