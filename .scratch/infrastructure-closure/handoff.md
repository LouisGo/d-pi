# S5 前基建收口交接

2026-09-30。范围与当前状态单源为 [spec](spec.md)，固定入口是 [项目总看板](../../docs/status.md)。本轮只做基建并分批本地提交；没有 push、公开发布或进入 S5/M2。

## 标准术语与实际迁移

领域定义单源 [CONTEXT](../../GLOSSARY.md)，自有 UI 用词单源 [产品术语](../../docs/product-terminology.md)，机器边界单源 [modules.json](../../architecture/modules.json)。本轮依据实际所有权收敛命名，没有增加实体或改变产品含义。

- 源码领域 `workspace` → `threads`，`WorkspaceService` → `ProjectSelectionService`；目录身份为 `workingDirectoryId`，原生关联为 `NativeSessionBinding`。SQLite `workspace` / `workspace_id` 保留原物理格式，在仓储映射；旧 v5 数据与 schema 版本未迁移。
- App 就绪选择为 `ThreadSelectionState` / `threadSelection`，布局为 `ThreadWorkbench` / `.workbench`，文件阅读为 `FilePanel` / `.file-panel`；接口、测试描述、CSS 与验证消费者同步。
- `ExecutionGrant` 表达执行准入，连接 UUID 为 `connectionGeneration`；本地请求水位和启动尝试分别命名。原生协议与冻结提交 target 的持久字段保留；Thread、原生会话、OMP 进程及 SessionHost 连接没有混为一个身份。
- 草稿、冻结原文、调用 ACK、业务接受和执行结果继续分开。unknown 不重发、ACK/草稿消费事务和恢复单写门槛未改。Git 当前差异、工具修改证据与未定义 Run Changes 分开，没有提前新增 Run 或检查点系统。

独立命名复核见 [审阅证据](evidence/naming-review.md)；原库兼容红绿、类型和定向回归见 [01](issues/01-language.md)。命名审阅使用冻结提交快照，后续工程和安全变化另行审阅。

## 持续入口

[总看板](../../docs/status.md)从所属规格 `project-status` 和任务 `Status` / `Blocked by` 生成；读取约定在 [任务合同](../../docs/agents/issue-tracker.md#总看板读取约定)。工程、试用和认可独立，不手工双写进度。源全文变更使快照陈旧，非法字段/依赖/链接会失败。

AGENTS 保留稳定路由，当前授权和交付回到规格。[决定登记](../../docs/decisions.md)保留 46 个稳定 ID 和顺序；[原登记快照](evidence/decision-history.md)只重定位相对链接，逐字正文核对见 [保留验证](evidence/decision-preservation.json)。未新增产品决定或逐条 ADR。

[工程入口](../../docs/engineering/checks.md)说明 check/fast、显式 hook 安装与保护、macOS arm64 CI、失败分类。门禁复用机器清单、声明和锁文件，不新增决定 DSL。源码边界、依赖职责的行为回归、报告新鲜度及门禁负例保留在常规工程检查中。

[OMP 维护](../../docs/engineering/omp-maintenance.md)、[桌面安全](../../docs/engineering/desktop-security.md)、[本地交付](../../docs/engineering/local-delivery.md)是按主题组织的维护入口。开发 skills 与原生资源职责不同，但固定 SDK 可发现项目 `.agents/skills`，没有声称运行时物理隔离。SDK 未升级，使用原有录制回放和薄适配。

## 分批本地提交

| SHA | 范围 |
| --- | --- |
| `e2b13e4bf67b37458df9d3cb7459ffb47a050c3d` | 简短规格、任务与授权边界 |
| `9d4e45a3ec66092b2a59dc3483ee4143dc525e7a` | 标准术语、源码/目录/接口/测试与相关当前文档迁移 |
| `501b09b7f6b3286b2d36b1d2ba58072c4bb55441` | 特权窗口加载与声明生成器两个已证实缺陷的 TDD 修复 |
| `6d7b44d485a31b387d5ae407cc5e224f23d85427` | 决定整理、稳定入口、规格状态约定和生成总看板 |
| `3285474e5c6a37b72a36337d870fd2f27c2f63cb` | 模块/工具/依赖门禁、保护原 hook 的安装器及 macOS arm64 CI |
| `2d671e891d5c2ebd88bcd1a15c5f42c65219b1d0` | 冻结审阅确认的 redirect/notices 边界补修，通过实际 pre-commit |
| `66b239c8c793128928135ab20a96a8a31caa6617` | 已选 Monaco 必需声明门禁补齐，目标红绿与独立 7/7 复核 |

交接自己的最终提交 SHA 以 Git 和最终答复为准，避免自引用循环。没有 push。

## 验证与限制

固定工具链为开发 Node 24.21.0 / pnpm 10.5.2，Electron 44.4.5 内嵌 Node 24.21.0，OMP SDK 18.3.0 / Bun 1.3.14，darwin-arm64。工具链路径曾误写并回落 Node 22；初轮输出保留并纠正标注，最终固定环境检查另外记录。入库文本日志仅裁掉行尾空白和多余 EOF 空行，不改结果。

[工程证据](evidence/engineering-results.md)记录环境和唯一一轮固定 SDK 的真实控制/同 ID ACK 后失败；[维护证据](evidence/maintenance-results.md)记录初轮隔离 Electron 加载/CSP/IPC 及独立安全候选包的确切 dirty 源码身份与 asar 哈希。包不是新用户试用交付，不借历史包证明后来源码。

实际检查与证据：

| 检查 | 结果 |
| --- | --- |
| `pnpm check:fast` 与 pre-commit | [快检](evidence/final-fast.txt)通过；主 checkout [安装](evidence/hook-install.txt)/[保护核对](evidence/hook-after.json)生效，原 hooks 和全局 hooksPath 保留。[非法状态实际提交](evidence/hook-rejection.txt)被拒绝、HEAD 不变；[正常补修提交](evidence/hook-success.txt)通过并形成 `2d671e8`。 |
| `pnpm check` | [最终完整输出](evidence/final-delivery-check.txt)退出 0：六类型入口、Biome、设计/i18n/窄边界、文档、模块/报告、架构 32、tooling 40、Vitest 387；1 个 CLI opt-in smoke 明确 SKIP。包含最后 D-07 门禁和任务 resolved/规格完成状态；[先前补修输出](evidence/final-fixed-check.txt)保留原阶段证据。 |
| `pnpm check:environment` / `validate:sdk` | [固定环境与一轮实际 SDK](evidence/engineering-results.md)通过；保留 native queue/显式继续消费一次、同 ID ACK 后失败，未覆盖历史样本。 |
| `pnpm build` / 本地 package | [最终 build](evidence/final-build.txt)、[独立打包](evidence/final-package.txt)退出 0。构建仍有现有大 chunk 提示；未为追求数字重写分包。签名明确跳过，默认 Electron 图标。 |
| 定向真实 Electron | [外域重定向拒绝](evidence/window-security-redirect-native.json)、[合法本地重定向](evidence/window-security-local-redirect-native.json)、[新包窗口入口](evidence/window-security-final-package.txt)通过；受限 IPC、CSP、Node/require 不可用及页面导航限制成立，不启动 OMP。 |
| 独立审阅 | [命名](evidence/naming-review.md)未发现可行动缺陷；[工程与维护](evidence/engineering-review.md)确认并关闭两项漏测路径，另对 D-07 门禁做定向复核。首次 notices 子进程超时后单独 2/2 通过，根因未确认。 |

最终工程候选包：`/Users/lou/Learn/d-pi/dist/infrastructure-final/mac-arm64/d-pi.app`；build `3285474e-dirty-1f488792`，Main SHA-256 `6c3a7c2fd36fa9069fb5d2c606b98859bd158eed766b87a11404699ff8e24e9a`，App asar SHA-256 `c5139d550c333623ad62f6790952ba6143cec825f4574c3d79edced8203f0652`。[包内 SDK](evidence/final-package-sdk.json)固定版本、lockHash、资源哈希检查通过。构建源为 `3285474` 加 dirty 补修，源码字节由冻结复核关联，未冒称后续 clean HEAD。用户试用包未覆盖，本包是工程证据。

最终仅状态/证据的提交由实际 hook 再跑快检；没有扩大原生或冷启动矩阵。

仍未关闭：

- [S3 暂缓队列后的退出出口](../m1-s3-control-recovery/issues/09-quit-discard-decision.md)继续延期。取消退出并明确继续直至队列完成，不能满足不愿继续执行剩余输入的需求。影响之后 S5 的正常退出验收与试用告知；不阻塞其他独立工程。本轮没有修改退出/清队列策略。
- 冷恢复缺执行全周期单写证据，继续只读；unknown 不自动重发。S5 不能把冷恢复执行或全量 TUI 能力写成已验收。
- 重写/外观构建继续待用户试用，真实供应商、个人扩展和系统 IME 未由本轮验收。未证明接手成本降低，不宣称效率提升。
- CI 配置未在远端执行；仅核对受支持的 macOS arm64 路线，不宣称 Linux/Windows 原生支持。
- 项目许可证、正式版本序列及公开分发由权利人/产品决定；签名、公证、更新未实施。24 个 SDK 包未找到许可文件候选，是公开分发前来源/声明核对缺口，不是内部 S5 工程阻塞或“上游没有许可”的结论。

完成必要基建后停止。进入 S5 需要另行授权并按其范围验收，不由看板计划、工程绿灯或用户未回复推导。
