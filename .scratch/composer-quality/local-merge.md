# Composer 完整本地PR合入记录

2026-10-08，用户明确授权本地完整PR到main并包含前面全部修改。已在原干净checkout `/Users/lou/Learn/d-pi` 切换main，执行no-ff合并；没有reset/stash、push、远端PR或发布。

- Merge：`98fa5db5b208214469d3d5013dc0f410fbc7e36d`。
- 第一parent/合入前main：`cb233c6c97a1694df8a344db65fd62fc724f3d82`；第二parent/完整来源：`ec09aeb5d0b5677970b98a4eb7bfd2ab7725e39e`。
- 实际merge-base：`a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`；原固定head `eb2e79ce4dda2014c71d54f31a905f795ad119a4` 的37个提交全部是main祖先。
- 来源共39提交：上述37 + ace6a19整段finding/验证接线修复 + ec09aeb完整PR/证据收尾；整段行为review与check固定ace6a19，后续仅治理文档。
- 源head和旧target均是main祖先。实际merge tree `df94ea0178628984276f10a0525f0ac7d4393304` 与预先merge-tree完全一致；无需冲突解决，没有遗漏原历史或主分支记录。
- 合并后main工作树干净，隔离composer-quality仍保留source分支。本文和工程状态在merge后另作仅治理收尾提交；不改生产源码。

完整check：架构35/tooling113/应用1319通过、2跳过；build通过；独立Spec/Standards闭合。历史失败保留，最终真实PDF也已通过。见 [PR](pr.md)、[原始检查](evidence/local-pr/check-complete.txt)、[可核对身份](evidence/local-pr/merge-verification.json)。

工程合入不替代用户认可；trial为feedback、acceptance为pending。本轮未运行GUI/Finder trace/真实IME/VoiceOver/长期性能/真实Host/provider。

原目录SDK已同步：固定OMP18.4.6、112包、548.4MiB/650MiB预算，新增image-input/image-compression完整。`pnpm check:environment` 最终0issues，`pnpm check:fast`最终exit0，治理状态已生成：engineering complete、trial feedback、acceptance pending。原目录SDK缺文件及治理字段枚举初次失败留在旧日志；最终以[环境](evidence/local-pr/main-environment-final.txt)、[main fast](evidence/local-pr/main-fast-final.txt)、[SDK同步](evidence/local-pr/main-sdk-prepare.txt)为准。无GUI启动或已有App强退。
