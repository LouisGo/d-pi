# 领域目录治理实施交接

日期：2026-09-29。范围：用户已明确启动第二版方案，允许不逐票推进 P0–P4；本地 commit，不 push，不扩展 S5/M2。本文记录实施证据，不把工程通过或 Agent 检查当作用户试用认可。

## 当前波次

- P0 已由本地 commit `fa2f34a` 落地：`architecture/modules.json`、结构例外、TypeScript 7 scanner 门禁、真实 CLI 正/负例、结构报告、架构 skill 与 AI 路由。
- P1 文件→选区→输入完整切片已在当前工作树形成待提交变更：`files`、`input`、`changes` 实际代码归入 `src/modules`；桌面桥和 Composer/FileWorkspace 的跨域组合归入 `src/app`；旧路径消费者已切到公开入口。
- P2–P4 尚未在本交接点声称完成；下一波继续迁移 workspace/preferences/platform/app/execution/conversation，并在恢复拆分时保持既有顺序。

## P1 实际成本校准

| 检查点 | 实际观察 | 结论 |
| --- | --- | --- |
| 定位能力 | 三个实际模块有机器清单和就近 `AGENTS.md`；合同、core/main/renderer 入口与测试可按领域直达。跨域组合集中在 `src/app/renderer/workbench`。 | 目录比旧 `features/main/renderer` 更直接；保留模块地图作人工导航，不生成第二套文档。 |
| 普通内部修改 | 迁移后的内部文件和测试移动不需要修改 `modules.json`；只有公开入口、环境和依赖变化登记。 | 清单粒度可接受。 |
| 合法复用 | `input` 通过一次 `files` 依赖复用选区公开能力；`changes` 通过 `files/main/public` 复用只读文件读取。 | 不需要逐调用点例外或额外工厂。 |
| 纯转发层 | 新增的 `public.ts` 只承担环境公开面；没有新增 service/manager/part 来迎合目录或行数。 | 公开入口属于门禁契约，未发现无意义业务包装。 |
| 门禁反馈 | 当前门禁输出来源、目标和规则；真实 fixture 覆盖公开入口、私有跨域、未登记依赖、Node/环境、循环、生产测试引用和非字面动态加载。 | P0 反馈可用，报告只作提示，不把行数变硬门槛。 |
| 工具选择 | `dependency-cruiser@18.4.0` 在当前 TypeScript `7.0.2` 下不识别 TS 7（实际扫描为 0 模块），未保留死依赖；改用 TypeScript 7 `typescript/unstable/ast` 的 scanner，零新增运行时依赖。 | 这是当前仓库的兼容性校准，不把 dependency-cruiser 宣称为已验证门禁。 |
| 过渡维护 | `architecture/exceptions.json` 目前只记录 Monaco→旧 i18n provider、input contract→旧 localization/threads contract 三条 P2 过渡边，均有原因和 `removeBy`。 | 过渡边可追踪，P2 清除；不扩大为宽路径豁免。 |

## 自动化证据

已运行并通过：

- `pnpm check:architecture`
- `pnpm test:architecture`（5 组真实 CLI 正/负例）
- `pnpm typecheck`
- `pnpm test`（47 个测试文件通过、211 个测试通过、1 个既有 skip）
- `pnpm build`
- `pnpm lint`、`pnpm lint:design`、`pnpm lint:i18n`
- `pnpm validate:design`、`node validation/s1/source-boundaries.mjs`
- `pnpm report:structure`

构建仍有既有 Zod 注释位置 warning；未见应用源码构建失败。P1 触及编辑器、Monaco、文件/Git 与 Composer，完整 GUI/原生交互证据需单独记录；Agent 检查不替代用户试用。

## 继续边界

- P2 必须先把偏好/共享 formatter/provider、workspace、存储基础和显式 execution 恢复步骤收拢；打开连接→v3 迁移→WAL→execution 恢复→v4/v5 迁移→组装发布的顺序不可改。
- ACK 与草稿消费标记继续由同一 SQLite 连接/事务提交；`unknown` 不自动重发，OMP 原生执行/队列/历史所有权不迁入 App。
- P3 再拆 RuntimeService/SessionHost 与 conversation；P4 收口剩余生产源码归属、环境检查、过渡边、文档和 CI。
- 不删除用户 SQLite/OMP 数据，不修改持久身份、IPC 外部语义或官方 SDK；不 push，不启动 S5/M2。

