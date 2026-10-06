# 验证记录

日期：2026-10-06；macOS arm64，Node 24.21.0、pnpm 12.8.1。初稿实现为 `cd198bb`，看板计划指纹修复为 `748a9b5`。本页记录截至本地交接 `3851773` 的验证，当时没有运行远端 CI 或产品试用；后续 PR 的远端 CI 结果独立记录在 GitHub。

## 确定性验证

| 检查 | 实际结果与范围 |
| --- | --- |
| `pnpm check:fast` | 初稿及指纹修复后均通过：工具精确版本、Biome、现行文档/链接、架构、结构与看板新鲜度 |
| `pnpm check` | 初稿完整通过：类型检查与设计/i18n、34 architecture、68 tooling、654 Vitest 测试通过；1 个原生 CLI opt-in smoke 按既有规则 SKIP，未冒称真实供应商验证 |
| `pnpm build` | Main/preload/Renderer 成功；既有 Monaco 大 chunk 警告仍在，本次没有应用源码修改 |
| `node --test tests/tooling/slice-plan.test.mjs tests/tooling/project-status.test.mjs tests/tooling/documentation-gate.test.mjs` | 最终指纹修复后19项通过；覆盖真实 CLI、fan-out/fan-in、切片限制、held/claimed、依赖、非法计划、门禁接入与无看板行 spec 的源指纹 |
| 四个 skill YAML | skill-creator quick_validate 尝试失败，系统与 bundled Python 均缺 PyYAML；改用 Ruby YAML.safe_load 校验 name/description/允许字段、UI metadata/default_prompt/描述长度通过。现行链接由 documentation gate 检查 |
| `git diff --check` | 实现及手写文档通过；收尾 staged 检查排除原始 `evidence/forward/evidence/review.diff`，该不可改写的 patch 有11个空白上下文标记行，已用 SHA-256 核实快照字节与来源一致 |

已有全量证据足够覆盖本次应用边界；指纹修复仅改任务 tooling，追加受影响回归与快速门禁，没有重复原生/GUI 全矩阵。

## 真实红绿证据

1. 新命令尚未实现：CLI fan-out/fan-in 测试以 MODULE_NOT_FOUND 失败；实现后通过，源文件未被命令写入。
2. 初始实现未处理 held/非法计划：3项测试失败（held 被放进 ready、重复选票成功、非法 JSON 未按门禁失败分类）；修正后5项通过。
3. 无看板行的 spec：hold 变化前后 digest 相同，回归测试失败；计划原始源加入既有指纹后通过，最终7项计划行为测试通过。

这些失败属于新能力和实际缺陷，没有为词汇表改名或既有正确行为制造红灯。

## 独立验证

第一轮 DAG reviewer 核实17项针对性测试，并在隔离样本中证实未知选票同时被 documentation/status 拒绝；无 actionable finding。整段 Spec/Standards 结果见 [review](review.md)。

隔离 forward 场景实际完成02a/03/04，保留原有 claimed05、held06、范围外07，test/check各9/9、看板检查通过，准确交付 partial。两名独立 fixture reviewer 分别审查需求与规范；代码无发现，执行记录问题修正后独立复核通过。首次 npm 默认消费个人配置是执行者偏差；原命令/警告与后续 fixture 内独立配置/cache 的修正均保存，未把这类失败称作产品 TDD 红灯。

补充 mini 使用两个真实 worker、同一固定 base、独立 cwd 和五文件写集，主 Agent 单写状态并按01→02串行合入，03 从最新集成点完成 fan-in。各 worker 真实 red→green；最终8/8通过、三票 resolved。微小写入阶段没有重叠声明；两个目录的目标测试进程由主 Agent并发启动，实际区间同为 `2026-10-06T02:46:40.923Z–02:46:41.044Z`，各3/3、exit0，actor/cwd/command/time 保存在各自 JSON 和原始日志。

主 Agent 在最终源 head `7bcea56` / `208caa3` 独立重跑原场景9/9、mini8/8，核实原看板和两个 frontier、工作树 clean、保护三票与 baseline 无 diff、两叶提交已在集成历史。五个 worker checkout 已在 clean/已集成核实后清理，两个集成 checkout 与分支/提交保留。固定快照与 SHA-256 见 [证据清单](evidence/snapshot-manifest.json)；这是纯 Node workflow 证明，不是 App/OMP/provider 或远端 PR 验证。

## 实质限制

- 本次验证开发工作流，没有新增产品功能，没有改变 M2 的交付/试用/认可。
- 未 push、创建远端 PR、merge main、访问真实账号或改全局 skills；远端 API/原始文件的 shell 请求未连接成功，官方研究通过 web 读取 release/tag 原文完成。
- 本 checkout 的提交 hook 未安装（`pnpm hooks:status` 实测），本轮提交前显式跑 check:fast；仓库已有 opt-in 安装与 CI 路径没有改变。
