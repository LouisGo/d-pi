# M2 retro 回流验证

范围：`7c9e1fe` 起的测试runner、M2包内等待、证据交接及接手指针。没有产品源码、版本、持久化、权限或执行政策变更。

## 目标红绿及原始记录

- 参数防错：[red](evidence/m2-retro-closure/runner-red.txt)中真实Vitest误执行不在目标范围的fixture；[green](evidence/m2-retro-closure/runner-green.txt)在启动前拒绝。最初fixture重复传入root导致工具参数失败，单独保存在 [fixture错误](evidence/m2-retro-closure/runner-fixture-error.txt)，不作为目标红灯。随后隔离小repo复制实际runner与环境脚本、使用实际固定Vitest，验证文件筛选、合法选项、全量入口及失败退出。
- 等待原因：[red](evidence/m2-retro-closure/wait-red.txt)只有通用timeout；[green](evidence/m2-retro-closure/wait-green.txt)提供场景及有界最后predicate错误。
- 终止错误：[red](evidence/m2-retro-closure/transport-red.txt)吞掉CDP关闭/请求超时；[green](evidence/m2-retro-closure/transport-green.txt)传播同一错误且只尝试一次。
- 操作前置：[red](evidence/m2-retro-closure/action-red.txt)中缺失目标被误当可用；[green](evidence/m2-retro-closure/action-green.txt)等待存在且disabled=false。补充迟到、busy/缺失、promise停滞、瞬态异常恢复及不依赖browser帧的回归，不伪称独立开发红灯。
- 证据交接：[临时Git场景](evidence/m2-retro-closure/evidence-handoff.txt)中普通add/ls-files真实拒绝被忽略log；明确force-add后从commit取回相同字节，未选择的runtime.log仍被忽略。仅验证新的交接步骤，不改Git忽略政策，不伪造产品TDD。

## 集成验证

目标回归、标准check、build及现有m2.17包内检查执行中；完成后填写实际结果。没有创建远端PR或运行远端CI，不以本轮工程检查代替M2产品验收。其它M2 worktree不在本轮评审范围。
