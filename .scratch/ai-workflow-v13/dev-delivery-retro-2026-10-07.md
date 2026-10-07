# Dev 与固定包交付复盘

2026-10-07，applied。用户明确授权本地 main 梳理开发指令并删除无用途旧包；基点 `4d4266ad2105360c936dd26593aae334a065e4fd`，修复随本记录所在提交保存。延续本会话的[按风险验证复盘](validation-retro-2026-10-07.md)，本轮不创建 worktree、远端 PR 或发布，不改个人全局规则与 memory。

## 证据、判断与改进

| 原始依据 | 重复成本 / 根因及确定程度 | applied 与验证 |
| --- | --- | --- |
| 基点 README 的启动代码块依次列 `check`、`build`、`dev`；local-delivery 的交付核对统一要求 App 路径/哈希/build ID | 把首次准备、日常启动、工程检查和固定包交接串成同一流程；文本歧义已确认。hook/CI 没有自动打包，不能归因于自动构建系统 | README 拆首次准备与日常 Dev；local-delivery 单源区分 Dev、构建预览、固定包；AGENTS/切片/PR/任务/验证入口仅路由到该规则。CLI help 与快速检查通过 |
| 原 `dev=electron-vite dev`；App 的 `D_PI_DATA_DIR` 只在显式设置时覆盖 userData，应用名同为 d-pi；ADR-0002 要求共享原生配置 | 开发态本身已有 HMR，但没有默认独立 App 数据和明确的源码路径提示。生产候选的版本/构建号被用来辨认日常源码，容易混淆。不是必须打包才能启动 | 默认 launcher 直接调用当前 checkout 的 electron-vite；按真实 checkout 路径固定开发数据，输出模式/源码/数据。显式绝对路径可覆盖，保留全部原生配置/profile 环境；不复制认证。数据分离、参数转发、失败传播测试及实际 Dev 启动通过 |
| [清理清单](evidence/dev-delivery-retro/package-cleanup.json)：所有当前 Git worktree 的 dist 共31个 App、10个 ZIP；含多份相同里程碑解包副本。既有交接与运行进程指向当前组件看板 App，M2 m2.20 原 ZIP 哈希可核对 | 旧输出缺保留用途和退役记录，固定 SDK 与 Electron 随多份包重复保留；成本确定，目录大小之和不能当 APFS 实际占用或内存 | 删除30个 App、9个 ZIP；仅保留正在运行的组件看板候选与M2待验收原ZIP。删除前检查路径/符号链接/运行进程；保留 ZIP SHA-256 与原始身份一致。保留用途和清理边界写回 local-delivery |
| 基点 local-delivery 仍硬编码 `0.1.0-m2.7`，实际 package.json 为 `0.1.0-workbench.3` | 文本复制的版本已过期；版本、源码身份与交付模式混用 | 版本改为引用 package.json 单源；不因功能/PR/worktree递增，Dev 不承诺固定哈希或 dirty=false。冻结候选才核对包内身份 |

这次调整取代“每轮开发结束都交固定包”的默认解释。历史 spec、交接、候选哈希及测试记录仍是当时的证据；清单中已删除的路径自本日起退役，不再是可直接打开的当前试用入口。产品工程状态、试用和用户认可仍分开，不关闭 M2 待验收项。

## 验证与评审

- 新入口缺失时首次测试因模块不存在失败；补空实现后，3项分别因未分离数据、未拒绝相对路径、未启动子进程/传播失败而失败；最小实现后3项通过。没有破坏原有正确行为制造红灯。
- `node scripts/testing/test.mjs node tests/tooling/development-launch.test.mjs tests/tooling/engineering-entrypoints.test.mjs tests/tooling/test-environment.test.mjs`：8项通过。原 CI/check/hook 和测试凭据隔离边界继续成立。
- `pnpm dev --help` / `pnpm preview --help`：实际 package scripts 接到 electron-vite 5.0.0 的对应入口，不准备 SDK 或打包。
- `pnpm check:fast`：工具、Biome、交互规则、文档、架构、结构及状态通过。首次发现当前 main 的结构快照陈旧，重生成并审查只有输入哈希及 Renderer 行数变化（27723→27729），依赖边界不变；未改产品源码。
- `pnpm dev`：Main/preload 开发构建、Renderer dev server、React Developer Tools 启动成功；Electron cwd 是本地 main，独立 drafts.sqlite 已创建，直接访问本机 Vite client 返回200。[启动观测](evidence/dev-delivery-retro/dev-startup.json)只证明启动与开发服务，未冒称 GUI 交互验收。初次 urllib 探测继承代理返回502，仅在本机探测中禁用代理后成功，未改 App/OMP 代理。
- 本地两轴复核（小范围模式，无独立 subagent）：Spec 对照本轮用户授权检查日常Dev、条件打包、清理范围与本地main交付；Standards 对照retro、数据ADR、工程入口检查默认配置继承、目录/失败语义、凭据测试隔离和历史证据连续性。两轴均无遗留高价值问题。此模式不声称独立reviewer评审。

未运行完整 `check`、生产 `build`、`package:mac`、preview 实际构建、完整E2E、Computer use 或真实供应商执行；本轮没有需要这些层级回答的产品行为缺口。`dev:watch` 的Main重启/preload重载语义来自固定electron-vite源码和[官方说明](https://electron-vite.org/guide/hmr-and-hot-reloading)，没有声称运行中执行可无损热重启。

## 后续入口与保留项

- 日常开发/本机反馈：本地 main `pnpm dev`。Main/preload 自动监听：`pnpm dev:watch`；先结束进行中的执行。按需检查编译差异：`pnpm preview`。
- 数据：`~/.d-pi/dev/d-pi-290bf7a6186d/`，不迁移旧候选 App 数据；如需特定数据用显式 `D_PI_DATA_DIR=/绝对路径`。共享原生设置的修改仍影响同配置的 CLI。
- 固定包仅按[本地交付条件](../../docs/engineering/local-delivery.md#选择运行与交付方式)生成；每轮按证据缺口验证，足够即停止。
- 保留当前运行中 `component-dashboard-feedback` App（包内源 e97c5a05，不能当作包含后来图标修正的当前 main）；保留 m2.20 原 ZIP（3c4c1060，SHA-256 `1011a3517f295b35d97c5f012222db2423880ab04222397499399ff61f5deabb`）用于尚未完成的M2固定候选验收。全部确切路径见清单。
- 删除仅限盘点的生成App/ZIP本身；源代码、用户数据、原生会话/配置、依赖、开发SDK、worktree与历史记录均未清理。`df`可用空间观测从68,658,332KiB到92,395,700KiB，约增加22.6GiB；这是系统观测，不精确归因于独占回收块。

修复 commit 可由 `git log -1 --format=%H -- scripts/development/launch.mjs` 找到；本记录和两份JSON证据随提交可取回。Dev 此次启动于提交前，build元信息保留当时WIP快照，后续HMR不能充当冻结包身份。
