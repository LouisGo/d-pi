# 完整本地PR证据来源

2026-10-08，root 在 `/Users/lou/.codex/worktrees/composer-quality/d-pi`，Node24.21.0/pnpm12.8.1；命令 PATH 使用 `/tmp/dpi-composer-node:/tmp/dpi-composer-tools`。原固定 head eb2e79c、目标 cb233c6、merge-base a9cf9a9，原37提交清单见 commits.txt。新增最终源码 ace6a19，源码与最终完整检查执行时的WIP字节相同，期间仅提交该已检查版本，行为没有修改。

check-full.txt 为第一次完整check在source token gate失败；check-full-final.txt为gate修正后25旧fixture失败，不作为最终通过证据。legacy-fixtures.txt记录补codec/source CLI后的5个失败，随后history 24/24、PDF14/14关闭。token别名/重复@ red分别先复现要求缺口，green对应最小修复；普通重复范围不消费和stale拒绝保留。

最终 check-complete.txt 是 `pnpm check --maxWorkers=4` exit0，架构35/tooling113/应用1319通过、2跳过；build-final.txt是最终源码 `pnpm build` exit0。PDF资源复制使用 COPYFILE_FICLONE、verbatimSymlinks，fixture给真实复制+多次准入/转换60s时间，生产20s转换上限未变。先前PDF worker字节转换成功，原resource root被运行App占用；clone默认改写链接造成身份拒绝亦修正。无生产guard绕过。

固定源码38提交的两个独立reviewer只读闭合见review.md；Standards另独立19+2测试通过，Spec只读核对原始结果，数量不合计。无新GUI/Dev/provider/真实Host验证。最终合入后仅治理文档和生成状态变化，执行fast新鲜度检查并验证合并树/祖先；实际merge身份记录于local-merge.md。
