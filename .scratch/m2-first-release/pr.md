## Summary

持久草稿和冻结提交引用的附件需要安全回收；原生子 Agent 需要可辨别的状态/结果；@搜索原先只返回后代文件，无法选择匹配的目录。本地分支实现附件权威引用/最后释放/七天延迟回收及检查清理，投影原生子 Agent 的独立身份与可得结果，并加入 typed 文件/目录引用与目录 basename 优先的有界共享索引。

`@@virtualList`现在首先显示`@virtualList/`文件夹，文件/目录有图标与类型，类型贯穿 manifest/编辑节点/冻结来源。目录发送冻结直接名称/类型，非递归读取正文；500条目超限明确失败保留草稿。Main索引有singleflight/LRU/TTL与工作量/内存预算，Renderer150ms合并输入，等待/失败时旧候选不可确认，Enter只插入。文件/目录发送保持规范项目根，拒绝根变化/外部symlink；unknown不重发、冷旧Thread只读和OMP执行/队列/历史所有权保持。

## Evidence

- 累计分支main base/merge-base `c8dbdbadf1a04ad2be54e01f1a509024c5d982ea`；当前产品source `31cb91229852d8c6dfabb6e88fce06e78cbf6030`，分支`codex/m2-lifecycle`。04c单段评审base/merge-base `b290b36`；前段lifecycle与本段各有独立Spec/Standards评审及修复复核，未冒称本轮重审全累计分支。
- 固定source隔离checkout：`pnpm check`711行为/34架构/70tooling通过，六类型、lint/设计/i18n/文档/结构/状态通过；两项opt-in跳过，20,001条目benchmark另行14/14执行。`pnpm build`及固定Electron44.4.5/Bun1.3.14/OMP18.4.6资源打包通过，原生SDK相关集成通过。
- 实际red→green覆盖目录/类型缺口、目录及祖先改名恢复、刷新失败Enter隐藏旧候选、根替换拒绝和schema10生命周期兼容。上一段真实释放时钟、迟到lease、旧manifest发布与维护drain证据仍保留。
- 20,001条目冷构建78.20ms，30次暖查询均值8.38ms、范围0.98–40.58ms，所有文件系统I/O为0。旧查询只覆盖首500后代，不能以不同覆盖宣称冷延迟倍数提升；测量为本机fixture。
- clean `0.1.0-m2.15 / 31cb9122-865978d1`实际macOS包24项通过，包含目录优先/类型/Enter、真实目录清单请求及冻结typed source、附件回收、原生子Agent、队列、切换/reload/冷只读；仅隔离localhost，无个人凭据/费用。ZIP CRC与app.asar同源核对通过。[本轮候选/试用/限制](project-references.md)、[机器结果](evidence/references-package-result.json)、[评审](project-references-review.md)、[上一段](lifecycle.md)。
- 主checkout其它交互策略WIP保留，未提交/混入候选；最终构建读取实际Main source/dirty身份，不靠输出目录名判断。本文件为本地body，本轮无push/远端PR。

## Merge Danger

Door：GUI/索引可回退；schema10迁移与前段私有文件清理包含one-way效果。before-v10在恢复后保留schema9库；typed JSON围栏防旧App默默丢类型，无新表。schema9库存投影不是删除授权，清理前仍复核当前owner/epoch，冻结与unknown不自动释放。

Blast radius：App SQLite、私有附件库存/冻结、Main文件授权/索引/维护/退出、SessionHost观察及Renderer展示。索引最多3项目/50k访问/4,194,304个UTF-16 code unit/深度64/5秒，最多100候选；部分范围和最终身份失败明确返回，不构成OS工具沙箱。目录仅直接条目且超500拒绝，不承诺递归正文。

Rollback：关闭App后恢复升级前数据库与配套私有内容，再切换兼容代码；仅git revert不能降schema，数据库备份不能恢复已清理文件。SQLite与文件系统无跨系统原子事务，幂等重入窗口已验证。候选未签名/公证，仅本地；真实供应商、系统输入法/PDF视觉OCR、余下M2组合与用户认可pending，工程通过或merge不代表接受。
