# M2 retro 收口与后续入口

2026-10-06。三项retro建议已经applied；实现 `b84ed9a`，真实CDP期限竞争补修 `473dffe`，起点 `7c9e1fe`，分支 `codex/m2-retro-closure`。本轮为工程工具及交接改进，无新产品候选。记录、验证、双轴独立review及本地提交完成，本轮与其已有诊断祖先已从`main@1c9c30a`快进整合到本地main的`9959992`，最后仅追加复核结论/整合记录与已保存独立输出；[整合证据](evidence/m2-retro-closure/local-integration.json)。不push/建远端PR，不继续其它M2功能。最终main提交由`git log -1 main`及本轮收尾结果给出。

当前补充：用户随后授权push/处理远端PR并同步main供UI开发；先前本地停下和其它提醒分支未合入是上一轮快照。最新合并范围、结果与UI起点见[M2远端收口](../m2-first-release/pr4-integration.md)，当前M2继续入口以其和所属spec为准。

## 目录变化

此前：`scripts/testing/test.mjs`原样传入Vitest参数，`validation/m2/package.mjs`内联CDP及wait，diagnostics/long-reading各自调用；worker交接没有选定证据的提交取回核对。

现在：

```text
scripts/testing/test.mjs          实际入口拒绝独立 --，保留直接filters/合法options
validation/m2/
  package.mjs                     组装包内GUI验证，继续使用原断言与预算
  wait.mjs                        有界场景等待、enabled前置、当前作用域取消
  cdp.mjs                         请求关联/typed错误/timer清理，绑定所属等待
  diagnostics.mjs                 busy结束再刷新/apply，明确场景完成条件
  long-reading.mjs                finalization等待标签
tests/tooling/
  test-runner.test.mjs             真实固定Vitest的隔离CLI范围/退出行为
  package-wait.test.mjs            延迟/缺失/busy/瞬态错误/总期限
  package-cdp.test.mjs             实际timer竞争/并发/close/send/自然退出
```

[工程入口](../../docs/engineering/checks.md)、[执行skill](../../.agents/skills/d-pi-implement-slice/SKILL.md)更新了所属操作指针。[复盘](m2-retro-2026-10-06.md)、[验证](m2-retro-validation.md)、[独立review](m2-retro-review.md)、[本地PR body](m2-retro-pr.md)及[票04](issues/04-m2-retro-closure.md)保存来源。

## 接续 M2

1. 从[总看板](../../docs/status.md)进入当前[M2 spec](../m2-first-release/spec.md)，核实HEAD、分支、工作区与其它运行中的worktree，按当前用户要求选定父票的真实残余范围，再拆leaf/依赖。不要将历史`next-stage.md`（m2.11）当当前任务清单。
2. 此checkout已有04a/04b/04c、05a/05b/05c/05d、06a–06g工程结果；父[04](../m2-first-release/issues/04-input-attachments.md)、[05](../m2-first-release/issues/05-queue-subagent.md)、[06](../m2-first-release/issues/06-reading-acceptance.md)以及01/02/03尚未完成全集。继续核实PDF视觉/OCR、V1-00/B6固定负载与故障组合、实际供应商及产品组合缺口，不能仅因子票resolved关闭父票。M2仍in-progress、trial delivered、acceptance pending；本轮不预定或启动下一阶段。
3. `/Users/louistation/.codex/worktrees/a613/d-pi`的`codex/m2-thread-attention`是其它会话分支，本轮未合入、改写、消息派发或清理。它与本轮共享诊断祖先`7c9e1fe`；后续由其所属会话在适当时机合入本轮本地main并验证语义，特别保留该会话自己的版本/候选身份和状态，不能把本checkout的m2.17记录覆盖它的新候选。开启重复任务前先核实该会话进度与HEAD，不凭此快照假定它仍在运行或已经完成。
4. 后续测试用 `pnpm test <file>`，独立`--`现在明确exit2；包内操作复用场景wait/真实完成条件。证据先选择准确文件、核实Git暂存/跟踪及交付commit可取回，再声明交付。使用固定资源前运行 `pnpm check:environment`，需要时沿用 `pnpm runtime:sdk`，不因模型为空要求用户重新登录。

## 现有候选和边界

m2.17产品source `ba0e7df1511b15932d293679959c2b594c3ea29c`，build `ba0e7df1-808e60b8`。ZIP位于`dist/candidates/d-pi-0.1.0-m2.17-macos-arm64-ba0e7df1.zip`，与[原身份](../m2-first-release/evidence/diagnostics-macos/package-identity.json)SHA一致。本地资源缺失原因unknown；完整ZIP副本经过修订harness的19项自动化重验后，恢复原App路径`dist/diagnostics-m2.17-clean/mac-arm64/d-pi.app`，旧不完整副本保留在`dist/validation/m2-retro-incomplete-candidate/d-pi.app`。app.asar哈希一致，无新产品构建；[恢复身份](evidence/m2-retro-closure/candidate-restoration.json)。本次原生保存/取消与Writer故障检查点未重跑，原21项证明保留历史。

冷旧Thread仍只读，unknown不自动重发；S3退出放弃待决只暂停所属出口。真实个人认证/收费供应商、公开发布、M3和用户认可不由本轮工具验证取得。工程交接完成后停下，等待用户后续指定范围。
