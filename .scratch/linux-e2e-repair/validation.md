# 工程验证

2026-10-09，macOS arm64，Node 24.21.0、Electron 44.4.5、固定 OMP 18.4.6。基点 `c14297c3`，分支 `codex/linux-e2e-repair`；以下结果对应本次工作区，未运行原 Linux 机器。

## 行为证据

目标缺口的真实失败→通过：SDK modern 裁剪/缺 baseline 拒绝、读取失败 Retry/互斥错误态、关闭初始门槛/提示合并；菜单错误在真实 Chromium 中复现后消失。补测既有 IPC/退出正确行为没有伪造红灯。

| 命令/检查 | 结果 | 覆盖 |
| --- | --- | --- |
| `node scripts/testing/test.mjs vitest src/app/main/lifecycle/window-close.test.ts src/app/main/ipc/draft.test.ts src/modules/configuration/renderer/settings/settings.test.ts src/modules/configuration/renderer/model-picker.test.ts src/app/main/lifecycle/quit.test.ts src/modules/ui/renderer/controls.test.ts` | 6 文件、22 项通过 | guard/ready 发布、读取 Retry、模型错误态、既有退出协调与控件 |
| `node scripts/testing/test.mjs vitest src/app/main/index.test.ts tests/integration/window-security.integration.test.ts` | 2 文件、32 项通过 | 真实 Main IPC/SQLite；恢复后保护、初始直接关闭、超时/迟到/失败、重复提示、安全边界 |
| `node scripts/testing/test.mjs node tests/tooling/sdk-packaging.test.mjs tests/tooling/sdk-preparation.test.mjs` | 2 文件、13 项通过 | 固定官方 loader 的文件选择规则；baseline 保留、modern 裁剪、未知版本/文件、许可、预算、准备事务/锁 |
| `node scripts/testing/test.mjs node tests/architecture/check-architecture.test.mjs tests/architecture/report.test.mjs tests/architecture/tooling-coverage.test.mjs` | 3 文件、30 项通过 | 模块门禁、生成报告和工具测试覆盖 |
| `node validation/m2/ui-popups.mjs .scratch/linux-e2e-repair/evidence` | 通过 | 隔离 Electron 的真实 mouse/key 输入；浅色 1178×814、深色 885×647，普通/搜索 Select 双向选择、可见/命中、Escape/focus、短/长 rail 及底部选择 |

长 rail：浅色 scrollHeight=1373/clientHeight=461，深色 1369/424；两者 scrollWidth=clientWidth=46。[测量记录](evidence/ui-popups.json)记录了真实平台，不能改标为 Linux。

## 静态与构建检查

工具模式环境检查固定依赖 48/48 通过；完整 TypeScript（core/renderer/main/host/preload）、Biome、design/i18n/interaction lint、设计基础检查、源码边界、文档/架构/生成报告检查通过。完整生产 `build` 通过，Main/preload/Renderer 均产出。收尾后再次核实类型、各门禁与生成状态/结构报告，`git diff --check` 通过；工具模式明确跳过原生可执行文件和 SDK 资源检查。

本机 Corepack 从隔离 cwd 误寻 pnpm 11.24.0；改用已安装且与 packageManager 匹配的 `/Users/lou/.cache/node/corepack/v1/pnpm/12.8.1/bin/pnpm.mjs`。工具门禁用 `node scripts/checks/check-environment.mjs --tools-only --pnpm-cli <该路径>`，其余 pnpm 脚本用 `node <该路径> <script>`。未改项目版本或门禁来迁就环境。

本轮提交 hook 的默认探测也遇到上述问题：pnpm 12 的原生 `npm_execpath` 不匹配探测器的 JS 入口规则，隔离 PATH 又优先使用 Node 目录中的 Corepack。提交时在任务临时目录使用字节一致的 Node 24.21.0 与固定 pnpm 12.8.1，工具探测通过；原 hook 继续完整执行 `check:fast`，项目与全局配置保持原状。

首次 tooling 测试受 sandbox 的进程枚举限制，按工具权限升级后 13 项通过。首次直接 design lint 缺少 pnpm 提供的 PATH，使用固定 pnpm CLI 后通过。Standards 评审发现两项既有 Main mock 回归，补真实接口、restore ready 前置和提示结束后再次握手，最终 32 项通过。

既有 act/exit-listener 警告、构建依赖注释/大 chunk 警告保留；无本次检查失败。没有运行整仓 `pnpm check` 全量链或全量业务测试；CLI artifact opt-in smoke 明确跳过。未重跑 Linux SDK/包内原生 GUI、真实 Provider/Models/图片/Host；Mac 构建不能解释报告中的 Linux 137。
