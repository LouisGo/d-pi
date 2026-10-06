## Summary

限定文件测试原先会因独立`--`被Vitest静默扩成全量，包内等待会吞掉真实CDP期限原因，交付记录可能引用未跟踪的证据。现有runner启动前拒绝分隔符；包内等待明确存在/可用/完成条件并在总期限取消所属CDP请求；worker交接核实选定证据可从commit取回。

范围为[票04](issues/04-m2-retro-closure.md)及[spec](spec.md)，分支`codex/m2-retro-closure`，base `7c9e1fee48ccb467db359a18401d8a30ca57a04e`，实现head `473dffe50c20f7bb4f1e267ffccfcb0ecbe01d12`。本地body供接手，不创建远端PR。本地main整合包含此前已独立交付的诊断祖先；其产品范围与review仍见[M2诊断交接](../m2-first-release/diagnostics.md)。

## Evidence

实际CLI范围、缺失/busy/传输终止和真实timer竞争有目标红绿；文档交接使用临时Git正负例，不伪造产品红灯。15项目标回归、751行为/34架构/89工具与完整check、build通过，2项既有skip。首次SDK资源失败保留，使用现有原子准备恢复后完整重验；原ZIP身份核对后修订harness通过19项隔离真实SDK/GUI包内检查，未重跑2个原生检查点，无真实个人供应商证据。精确输出、SHA清单、两轴独立review与范围限制见[验证](m2-retro-validation.md)和[评审](m2-retro-review.md)。没有远端CI结果。

## Merge Danger

本轮工具和文档为two-way变更：直接revert `473dffe`与`b84ed9a`可恢复旧入口及skill；已有诊断产品祖先不属于这两提交。影响为测试命令兼容性、M2验证脚本的失败/清理路径和证据交接；无产品源码、schema、秘密/权限、执行或恢复政策变更。恢复忽略的本地SDK/App资源是从固定SDK/原同源ZIP进行的可逆修复，旧不完整App保留，Git revert不自动倒退这些资源。M2父票/用户认可未完成，不把本地整合当远端merge或新版本接受。
