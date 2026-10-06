# M2 retro 回流验证

范围：`7c9e1fe` 起的测试runner、M2包内等待、证据交接及接手指针。没有产品源码、版本、持久化、权限或执行政策变更。

## 目标红绿及原始记录

- 参数防错：[red](evidence/m2-retro-closure/runner-red.txt)中真实Vitest误执行不在目标范围的fixture；[green](evidence/m2-retro-closure/runner-green.txt)在启动前拒绝。最初fixture重复传入root导致工具参数失败，单独保存在 [fixture错误](evidence/m2-retro-closure/runner-fixture-error.txt)，不作为目标红灯。随后隔离小repo复制实际runner与环境脚本、使用实际固定Vitest，验证文件筛选、合法选项、全量入口及失败退出。
- 等待原因：[red](evidence/m2-retro-closure/wait-red.txt)只有通用timeout；[green](evidence/m2-retro-closure/wait-green.txt)提供场景及有界最后predicate错误。
- 终止错误：[red](evidence/m2-retro-closure/transport-red.txt)吞掉CDP关闭/请求超时；[green](evidence/m2-retro-closure/transport-green.txt)传播同一错误且只尝试一次。
- 操作前置：[red](evidence/m2-retro-closure/action-red.txt)中缺失目标被误当可用；[green](evidence/m2-retro-closure/action-green.txt)等待存在且disabled=false。补充迟到、busy/缺失、promise停滞、瞬态异常恢复及不依赖browser帧的回归，不伪称独立开发红灯。
- 证据交接：[临时Git场景](evidence/m2-retro-closure/evidence-handoff.txt)中普通add/ls-files真实拒绝被忽略log；明确force-add后从commit取回相同字节，未选择的runtime.log仍被忽略。仅验证新的交接步骤，不改Git忽略政策，不伪造产品TDD。

## 独立review后的实际CDP红绿

两轴独立review发现：外层等待和真实CDP请求同为30秒时，外层先超时，实际传输原因被泛化且pending仍保留。主Agent复现后，[真实期限红灯](evidence/m2-retro-closure/cdp-deadline-red.txt)→[绿灯](evidence/m2-retro-closure/cdp-deadline-green.txt)，`473dffe`将实际CDP请求纳入当前等待取消作用域；总期限取消请求并保留 typed cause，清理timer/pending，互不影响并发等待。另测回包、close、自身timeout、send异常、迟到响应和子进程自然退出；独立保持原30000ms触发复核见[评审](m2-retro-review.md)。

## 集成验证

- [目标回归](evidence/m2-retro-closure/targeted-final.txt)：15/15；[快速检查](evidence/m2-retro-closure/fast-fix.txt)通过。
- [首次完整check](evidence/m2-retro-closure/check.txt)保留3项SDK相关失败。当前忽略的SDK资源缺顶层包入口且import修正hash不符，[环境负例](evidence/m2-retro-closure/environment-before.txt)→用现有 `pnpm runtime:sdk` [原子准备](evidence/m2-retro-closure/environment-prepare.txt)→[环境零问题](evidence/m2-retro-closure/environment-after.txt)，3项受影响SDK[回归通过](evidence/m2-retro-closure/sdk-recovery.txt)。资源丢失原因 unknown，不归因于本轮产品改动。
- 修复后 [完整 `pnpm check`](evidence/m2-retro-closure/check-final.txt)通过：751行为、34架构、89工具；2项既有行为skip，类型/设计/i18n/文档/结构/状态门禁通过。[`pnpm build`](evidence/m2-retro-closure/build.txt)通过，保留既有Monaco chunk大小warning。
- [首轮包内失败](evidence/m2-retro-closure/package.txt)保留：现存m2.17 App同样缺SDK包入口，模型列表不可用。原交付ZIP SHA与原身份一致且资源完整；从原ZIP解包后，[修订harness包内重验](evidence/m2-retro-closure/package-restored.txt)通过19项自动化检查，[结果](evidence/m2-retro-closure/m2-result.json)、[诊断结果](evidence/m2-retro-closure/diagnostics-result.json)。使用固定真实SDK、Electron GUI、隔离HOME/App/config与localhost供应商；无个人账号或真实供应商费用。命令 `node validation/m2/package.mjs dist/validation/m2-retro-restored-candidate/d-pi.app --diagnostics`。
- 本次没有 `--diagnostics-inspect`，未重跑原生保存/取消及Writer故障两个检查点；原m2.17的21项证明仍为历史记录，不冒称本次21项。未更改产品source/version/build，不生成新产品候选。恢复副本的app.asar与原身份一致，已将完整副本恢复到原交付App路径，并在`dist/validation/m2-retro-incomplete-candidate/d-pi.app`保留不完整副本；[恢复身份](evidence/m2-retro-closure/candidate-restoration.json)。

原始输出保留字节（含ANSI及历史日志行尾空白），不改写以制造 `git diff --check` 全范围通过。源码/手写文档执行该检查时排除 `.scratch/ai-workflow-v13/evidence/**`。选定证据纳入提交并从提交取回核验，字节清单见 [SHA-256](evidence/m2-retro-closure/sha256.json)。没有创建远端PR或运行远端CI，不以本轮工程检查代替M2产品验收。其它M2 worktree不在本轮评审范围。
