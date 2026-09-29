# 领域目录治理实施交接

日期：2026-09-29。范围：用户已明确启动第二版方案，允许不逐票推进 P0–P4；本地 commit，不 push，不扩展 S5/M2。本文记录实施证据，不把工程通过或 Agent 检查当作用户试用认可。

## 当前波次

P0–P4 已完成工程交付并分波本地提交，当前工作区应保持干净；用户试用仍待进行。

- P0：`fa2f34a chore: add domain architecture gates`
- P1：`de48359 feat: migrate files input and changes domains`
- P2 恢复顺序：`2f81069 refactor: make execution recovery explicit`
- P2/P3 领域迁移：`06b5031 refactor: complete domain module migration`
- P4 收口：当前 HEAD 的 `chore: close domain architecture governance`，包含全量归属门禁、例外清理、文档和 AI 规则同步。

本次迁移没有改变 SQLite schema、IPC 外部语义、持久身份或官方 SDK。`AppStorage` 保持 `v3 + WAL → execution recovery → v4/v5 → publish`；App 收据与草稿消费标记仍沿用同一 SQLite 事务；`unknown` 不自动重发；OMP 继续拥有原生执行、队列、工具、原生历史与记忆。

## 实际落点

- `src/modules/files`、`input`、`changes` 保留 P1 文件/选区/输入路径。
- `src/modules/workspace`、`preferences`、`conversation`、`execution` 完成合同与环境分层；`src/app` 承担入口、跨域组合和桌面桥。
- `src/platform` 承担 SQLite、诊断、真实路径、OMP 协议/资源与消费门控；`src/shared` 只保留稳定纯基础；`runtime` 保持官方 SDK 薄宿主。
- `RuntimeService`、`SessionHost` 没有按行数切成空壳；准入、提交协调、Host 连接、待答交互、阅读投影和原生会话等有独立责任的边界已通过公开入口落地。目录与结构报告不构成新的业务真相。

## P1 成本校准结论

| 检查点 | 实际结果 |
| --- | --- |
| 定位能力 | 模块目录、环境入口、测试和就近 `AGENTS.md` 可按领域定位；跨域 UI 仍集中在 `src/app/renderer/workbench`。 |
| 普通内部修改 | 不需要为普通文件移动或内部补测修改 `modules.json`；只有公开面、环境或跨模块依赖变化才登记。 |
| 合法复用 | `input → files`、`changes → files` 通过公开入口复用，不需要逐调用点例外或包装工厂。 |
| 结构成本 | 139 文件迁移后，仍保留必要的生命周期协调器；没有为目录/行数引入 `part`、通用 Manager 或第二套执行模型。 |
| 门禁成本 | TypeScript 7 scanner 兼容当前仓库；真实 CLI 正/负例能指出来源、目标和规则；结构报告只提示规模，不阻断合理长文件。 |
| 例外维护 | P1 过渡边已在 P2–P4 清除，当前 `architecture/exceptions.json` 为空。 |

## 自动化证据

以下命令在最终收口波次通过：

```text
pnpm check:architecture
pnpm test:architecture
pnpm report:structure
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm lint:design
pnpm lint:i18n
pnpm validate:design
node validation/s1/source-boundaries.mjs
```

关键结果：结构报告覆盖 `160/160`，`unowned=0`，例外为 `0`；Vitest 为 `47` 个测试文件通过、`212` 个测试通过、`1` 个既有 skip。构建仍有既有 Zod 注释位置与 Renderer chunk 体积 warning，但成功完成。

## 受影响 GUI 证据

已用 macOS 原生 Electron 验证页检查本次触及的 Editor 路径：输入 `第一行\nsecond-line` 后，AX 可见 textarea 与渲染行；Cmd+Z 清空、Shift+Cmd+Z 恢复；主题和密度切换后截图可见深色界面、文本、图标、textarea 与控件。一次 ScreenCaptureKit 瞬态错误不影响随后 AX 对 Undo 的确认。该证据是 Agent 验证，不替代用户试用或产品认可。

## 继续边界

- 不推送，不启动 S5/M2，不把本次工程交付写成用户已认可。
- S3 冷恢复单写限制和用户试用状态保持原记录；本次只保证目录迁移没有改变既有恢复顺序和所有权。
- 后续若发现行为缺陷，先按 TDD 写出失败测试，再做最小修复和必要回归；不因结构已收口而扩大范围。
