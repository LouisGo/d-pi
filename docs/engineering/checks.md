# 日常检查、hook 与 CI

工程命令单源在 [package.json](../../package.json)，开发 Node 在 [.node-version](../../.node-version)，pnpm 在 `packageManager`。按 [README](../../README.md#环境准备与启动)准备；实际版本、结果和未覆盖项在所属规格及 [总看板](../status.md)读取。

| 入口 | 责任与运行成本 |
| --- | --- |
| `pnpm check:tools` | 开发工具、必需基础依赖声明、精确版本、根 lock importer 与同族版本一致；不启动原生资源 |
| `pnpm check:fast` | 上述快速工具检查、Biome、文档/锚点/D-ID/任务依赖、模块公开面/环境/禁止依赖、结构报告与看板新鲜度 |
| `pnpm check` | 复用快速检查的标准入口，追加各环境类型、设计/i18n、门禁负例与隔离行为测试 |
| `pnpm check:environment` | 显式启动已安装 Electron/Bun 并核实固定 SDK manifest、资源哈希和异常启动环境 |
| `pnpm validate:sdk` | 现有固定 SDK 的停止/继续/消费竞争与同 ID ACK 后失败；localhost fixture，无个人凭据，不冒充供应商验收 |
| `pnpm build` | Main、preload、Renderer 构建；不等于打包、原生或用户试用验收 |
| `pnpm plan:slice -- .scratch/<feature>/spec.md --slice <id>` | 只读列当前计划选票的 ready/claimed/blocked/held/resolved，不执行任务或推断授权；格式与依赖校验已接入 documentation/status |

模块公开入口和允许依赖来自 [architecture/modules.json](../../architecture/modules.json)，运行环境兼容与禁止工具依赖由通用 checker 执行；依赖版本来自声明与锁文件。门禁只维护已确认基础依赖的必要集合/家族关系，不另写散文决定 DSL。代表性的 store 订阅、资源身份与 Query 离线/重试测试继续在标准套件中，依赖存在本身不证明职责接入。

## 显式安装的提交 hook

`pnpm hooks:install` 安装 Git 元数据里的 dispatcher，再调用仓库 [.githooks/pre-commit](../../.githooks/pre-commit)；原 hook 文件及配置值保留，先执行原 pre-commit，再运行本 checkout 的 `check:fast`，其余原 hooks 继续转发。安装不改全局配置、不启用新的 worktree 配置；其他 linked worktrees 继续原 hook。

`pnpm hooks:status` 读取安装状态；`pnpm hooks:uninstall` 恢复安装前本地 `core.hooksPath`，不删除原 hooks。安装后用户另改配置时不静默覆盖或卸载。安装与当前 checkout 的实际拒绝/成功验证见[收口工程票](../../.scratch/infrastructure-closure/issues/03-engineering.md)。安装方式是显式工程操作；首次 clone 不假装已启用。

快速 hook 检查工作树；CI 检查实际提交树。部分暂存时要审查暂存 diff，不能用工作树未暂存的修复证明提交合规。结构或状态源变化后显式运行 `report:structure:write` / `report:status:write` 并审查生成 diff，不自动在 hook 修改文件。

## CI 与失败分类

[check.yml](../../.github/workflows/check.yml)仅走 macOS arm64，断言实际平台/架构；冻结安装及资源准备后复用 `check:environment`、`validate:sdk`、`check` 和 `build`。默认 CLI opt-in smoke 明确跳过；SDK 行为单独运行，录制样本回放继续在 `check` 中。未验证的 Linux 原生路径、Windows、其他架构不作为支持声明。CI 配置存在与远端实际运行分别记，当前收口不 push。

- 自有架构/设计门禁的规则违反返回 1，检查无法开始或工具崩溃返回 2；hook 安装错误返回 2。环境入口的发现项返回 1，probe 的 `missing` / `crashed` 和原因单独记录；检查自身无法开始返回 2。外部 TypeScript / Biome 保留自身退出码，不能只凭数字推断失败类型。缺配置或未取得结果不伪装成零违规。
- 快速工具入口不做原生资源检查，测试的 CLI opt-in 未启用时输出 `SKIP` 与原因，不冒称通过。
- 门禁自身负例在 `test:architecture` / `test:tooling`，验证目标错误确实失败；日志中预期的 FAIL 属于这些负例，最终测试结果另看退出码。

已有资源或路径未变化时不重复原生全矩阵；改到实际入口、随包资源或可见行为时补针对性证据。工程通过、Agent 实际 GUI 观察与用户试用继续分开。
