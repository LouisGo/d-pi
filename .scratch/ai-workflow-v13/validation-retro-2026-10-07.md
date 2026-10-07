# 按风险验证与窄场景入口

日期：2026-10-07。状态：applied（工程验证完成；PR关联检查与合并状态在目标端核实）。基点：efd192f4d5b965b4ad7ee46ee010634806e78604。

## 范围与授权

用户明确要求先改善工作流程、推进完成 PR，方便下阶段开发。本轮落实现有 D-28 的风险选择与停止条件，并收窄现有工作台/包内验证入口；允许本工作流分支的 push、PR 和完成合并。主 Agent 在独立 worktree 实施，不修改应用业务、个人全局 AGENTS、全局 skills 或 memory；不扩为全产品测试平台。无重要产品待决。

## 证据到改进

| 原始证据 | 成本/错误与根因 | 最小改进 | 验证方式 |
| --- | --- | --- | --- |
| [描边修正验证](../codex-workbench-ui/validation.md#2026-10-07-鼠标描边与键盘焦点纠正)与原会话01a111e4-decb-7341-84c4-f961e9630e42的指针修正段；CSS/验证驱动修改后仍运行68条Electron、14条包内记录和CUA | 合同已按风险约束，但运行选择没有清晰落点；包内增量flag不缩小基础执行路径。已确认存在过宽验证，不推断所有历史任务均如此 | 在既有无头合同补默认验证选择与升级/停止依据；工程入口提供实际窄场景命令 | 文档门禁、命令可执行、未运行项不冒称通过 |
| package.mjs 的 --workbench 分支后仍进入执行、双Thread、重载、冷恢复 | 只能追加增量，无法只核对当前包工作台；根因确定 | --scenario=workbench 只跑顶栏/主题/Modal，明确零供应商请求和执行会话；保留默认完整流程 | 参数行为负例＋实际窄包内运行＋旧完整路径兼容运行 |
| workbench.mjs 的焦点检查与几何、连续性、拖拽、采样混在同一入口 | 小焦点修正只能复跑整套GUI；根因确定 | --scenario=focus 复用真实鼠标和键盘检查，只跑两主题代表控件及Esc回焦 | 实际窄焦点运行、完整入口兼容、错误选择启动前失败 |

## 验证与停止条件

这次修改的是验证驱动：较低层测试能证明参数错误被拒绝，无法单独证明真实Electron中确实跳过其余流程。因此各跑一次窄场景和受影响的原完整路径，核对输出范围、零请求/会话及原完整检查；通过后停止。不追加Computer use，不重新打产品包，不做真实账户或产品性能验收。包内运行复用既有f9cc66e clean候选，只证明新驱动对该候选的运行，不冒称产品新构建。

TDD：参数路径/范围拒绝与启动前拒绝先失败（3个目标行为失败，默认完整行为保持通过），再最小实现。文档调整与完整入口兼容属于回归验证，不制造应用行为红灯。

## 工程结果

实现提交：`b31ff78e621ce799cbc218192e51052fb553a040`。Node 24.21.0 / pnpm 12.8.1 / macOS arm64。

- `node scripts/testing/test.mjs node tests/tooling/*.test.mjs`：93项通过；范围参数正/负例包含在标准tooling入口中。
- `pnpm check:fast`、文档门禁和 `git diff --check` 通过。
- `node validation/m2/workbench.mjs <output> --scenario=focus`：8项真实Electron/CDP检查通过，[结果](evidence/validation-retro/focus.json)。
- `node validation/m2/workbench.mjs <output>`：默认完整入口68条记录通过，[检查名称与范围摘要](evidence/validation-retro/workbench-all-summary.json)；原始JSON保留于本机 `/tmp/d-pi-validation-workflow-workbench-all-raw.json`，不把摘要替代原始观测。
- `node validation/m2/package.mjs <既有f9cc66e候选> --scenario=workbench`：4项通过，供应商请求0、执行会话0，[结果](evidence/validation-retro/packaged-workbench.json)。
- `node validation/m2/package.mjs <同一候选> --workbench`：默认完整基础流程13项通过，localhost fixture请求2，[兼容结果](evidence/validation-retro/packaged-all.json)。未重跑其他功能增量，系统原生交互与用户认可未验证。

完整原生路径只因本次验证驱动的控制流/共享收尾变化做一次兼容回归。后续小改动按受影响风险选择窄场景，不将本轮命令集合变为新的必跑清单。源码不含产品改动；无需安装提交hook或重打App。

## 独立复核与交付

Spec与Standards分别由两个只读独立reviewer审查 `efd192f4…b31ff78e`，实际merge-base为efd192f4；双方均无高价值发现，并各自复跑4项参数测试通过。Spec覆盖12个变更文件、当前请求/D-28及相关合同；Standards覆盖三个验证脚本、测试、隔离环境和CDP/等待直接依赖。双方未独立重跑GUI或完整矩阵，不把主Agent证据改称reviewer实测。随后仅补本验证结果、完整GUI摘要及交接，主Agent核对其与实际命令输出一致。

[PR #7](https://github.com/LouisGo/d-pi/pull/7)承载本轮交付，具体最终head的CI与合并状态以该PR的实际checks/merge记录核实；合并前要求最终head的必要检查通过。[实现commit](https://github.com/LouisGo/d-pi/commit/b31ff78e621ce799cbc218192e51052fb553a040)未改变应用行为。

后续从包含本PR的干净main继续原功能规格。Agent先选择受影响的最低充分验证；需要升级时说明具体缺口和停止条件。产品试用、系统IME/物理拖窗/VoiceOver与M2认可仍由原规格维护。
