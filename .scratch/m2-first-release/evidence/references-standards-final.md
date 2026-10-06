# 04c 最终 Standards review

结论：原 P1 已解决；最终固定范围没有未解决的高价值 Standards 发现。

## 输入与覆盖

- base 与实际 merge-base：b290b36ea73f6586f6b9706e014f4c80a0720d33。
- final head：31cb91229852d8c6dfabb6e88fce06e78cbf6030。
- 只读 review checkout：/Users/louistation/.codex/worktrees/project-reference-review/d-pi；此前主体固定 fe6a426，追加 fe6..7760b70 的派生报告、7760b70..c45 的刷新失败候选修复及 c45..31cb 的发送根身份修复均用固定 Git 对象独立阅读。现在 review checkout 已由整合方更新到31cb且干净。
- 覆盖整个 b290...fe6 主体31文件及后续全部追加差异：Main索引 bounded/top100/并发/TTL/失效/LRU/close；files读取与发送冻结授权；file/directory类型贯穿IPC、manifest、原子节点与prepared来源；schema10/旧manifest/备份恢复/草稿释放；Query查询身份、150ms键入合并、旧结果/失败/Enter；图标/类型文字/共享Button主题与模块边界；相关测试、包内validation及派生report。
- 规范依据：root/modules/files/input/app/platform/shared AGENTS，04c票/M2spec，相关files/input/storage/foundation/headless/diagnostics/design/icon/module合同及code-review/typescript/state-query/architecture/design-system skill。使用Impeccable上下文与机械UI检查，无额外产品范围扩张。

## 已关闭发现

[P1][Standards] 新目录冻结分支采用重新规范化后的项目根，可能发送未授权外部目录清单。
原复现：真实listProjectFiles在project根rename后同路径变外部symlink，返回outside/selected的条目且truncated=false；Main原先仅复核SQLite Thread字符串。
31cb修复：attachment-service.ts的共享readReference在files调用前lstat根并要求目录及realpath===原Thread目录；读取后再次lstat/realpath，dev/ino/ctime必须与前样本一致；随后仍复核Thread关联。提前根替换为symlink返回reference-denied，读取期根替换返回明确失败，结果不会进入JSON冻结/put。普通文件与目录共用此检查，原manifest缺类型仍走file；Main项目入口canonical目录与新校验一致。通用files浏览别名能力不再推导为发送授权。
新增真实service回归分别覆盖file/directory：选中引用后根rename+外部symlink，prepare必须失败且保留同attachment token；其余实际图片/外部symlink/目录冻结/超限回归一并通过。修复位置与合同没有新增高价值问题。

另已独立复核c45：entries排除search.isError，防止同query刷新失败后的Query保留data进入隐藏键盘候选；新增真实React断言alert、无option、Enter被消费且零add-reference，与原因匹配。

## 本轮验证

- final同HEAD candidate核实31cb，运行项目隔离wrapper：node scripts/testing/test.mjs vitest src/app/main/wiring/attachment-service.test.ts；1文件6测试通过（含两种根替换回归、图片引用、目录冻结和超限）。
- git diff --check b290b36...31cb912通过。
- 前轮Impeccable detect四个改动UI源码返回[]；31cb无新增UI改动。
- review最终git rev-parse HEAD=31cb912，git status --short为空；源码未由review修改，临时报告与复现仅在/tmp。

## 限制

本review没有重复整合方正在跑的全check/build或20,001项benchmark；不声明真实provider、IME、GUI视觉或用户认可。文件系统检查是读取前后身份采样，沿用项目的非OS沙箱边界，不声称抵御任意持续外部攻防。没有为此构建复杂攻防研究。
