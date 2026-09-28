# S3 工程证据

2026-09-28，macOS arm64；构建版本 `0.1.0-s3.0`，准备基线 `d8ad345` 加本轮实现（最终提交见 Git 历史）。试用状态见 [handoff](handoff.md)，不等于用户认可。

## 官方来源与资源

OMP SDK 固定 `18.3.0`，对应官方 commit `62bc57be1b03ef0802a33cf7f5f530e534527531`；Bun `1.3.14`。`pnpm-lock.yaml` 固定发布包完整性，原始 SDK 与依赖复制入 `resources/sdk`，没有修改或补丁。以下 npm 发布源码与先前固定 commit 源码摘要相同：

| 官方文件 | SHA-256 |
| --- | --- |
| agent-session.ts | `27c07b78a25a275dbc3438f9c6f04924a77b4a81b774da3e8ebbe25d9783849c` |
| rpc-mode.ts | `f2f892eb162257094f266893c74e19aa14696b3916c23967ff56ae8fbc3d306b` |

App 自有入口是 `runtime/host.mjs`，启动时使用官方 profile 校验，明确传入管理目录的 SessionManager；标准命令和扩展交互委托给官方 `runRpcMode`。`ConsumptionGate` 注册到 claim 前 hook 和 model-call 前 hook。公开 `runModeExitTeardown` 重新唤醒原生调度，无输入重建或自动重发。

启动验证 Bun、host、gate 的 SHA-256 和平台/固定版本；这不是全量 SDK 依赖逐文件启动校验，也不是签名验证。依赖完整性由锁文件安装和资源复制保证；`pnpm runtime:sdk` 会重新复制依赖以修复资源缺失。随包资源清单快照见 [sdk-manifest.json](evidence/sdk-manifest.json)。

## TDD 与针对性修复

按行为推进，并未用后补测试冒称历史红灯：

- 消费门闩：停止原因独立、一次 abort 不解除原因，红→绿。
- 待答快照、重复/取消/过期/断链写失败，红→绿；官方原生 timeout 不会额外发送 cancel，因此使用收到的 timeout 停用回答。
- SQLite 显式再次发送：新 ID 关联原文、不清理后来草稿，红→绿。
- 退出协调：停止后仍有队列/后台活动不退出、取消等待不在以后偷偷退出，红→绿。
- 多提交排队后 Host 退出只处理最后一条的缺口，红→绿；迟到 idle RPC 不得清掉有原生队列的在途集合，红→绿。
- 控制/回答运输结果保留原 trace 和代次且无回答正文，红→绿。
- 真实 SDK 首次样本发现默认 SDK session 未落入管理目录；明确传 SessionManager 后通过。
- 真实 SDK 第二次 stop 导致原生调度停住；停止改为幂等后通过。更新停止覆盖同批未处理的 continue，样本直接通过（既有正确行为补测）。
- 无效 profile 在 SDK 导入默认退回默认配置，真实样本先失败；调用官方 CLI 同一 profile 校验并延迟 SDK 导入后通过。
- 正常 GUI/随包退出先失败：idle RPC 早于 admitted 清零，留下已 ACK 的在途项；新增回归先失败，原生后续空闲控制快照可收束已 ACK 项、未得回执项仍保护后通过。
- 首个随包候选漏复制 node_modules，真实包检查发现；按打包器源码的根目录过滤规则显式复制该目录后，迁移包真实运行通过。没有修改打包器或官方 SDK。

恢复重复 inspect/allow/start 不 fork、不换绑定、不覆盖草稿、旧代次/撤销授权拒绝、仅后台任务阻止退出及资源损坏拒绝等是边界补测；不把这些通过误写为新增写恢复能力。

## 最终验证

| 层次 | 命令及结论 |
| --- | --- |
| 自动化 | `pnpm check`：类型、Biome、设计 lint、设计/源码边界通过；29 文件、92 测试通过；1 个旧 CLI 可选 smoke 默认跳过 |
| 构建 | `pnpm build` 通过；保留现存 Zod PURE 注释与大 chunk 提示 |
| 真实官方 SDK | `SDK_ROOT=dist/s3-candidate/mac-arm64/d-pi.app/Contents/Resources/sdk node validation/s3/sdk-control.mjs`：管理目录、停止保留 queue、重复 stop、较新 stop 覆盖 continue、明确继续同 session 只消费一次、最终无残留活动；无效 profile 拒绝 |
| 正式 GUI | `pnpm exec electron validation/s3/app-control.cjs`：真实 Main/preload/Renderer/utility Host/SDK，本地模型 fixture；忙碌排队→停止→刷新→继续，无重放；官方扩展 confirm/select/input/editor 收到四类 GUI 回答；真实主题/密度切换及正常退出，exit 0 |
| 随包 | electron-builder `--mac --dir --config.electronDist=node_modules/electron/dist --config.directories.output=dist/s3-candidate`；显式完整 SDK 资源，未签名 |
| 迁移包 | `node validation/s3/package.mjs`：复制到含空格路径，真实包执行两轮同一会话、S1 schema 迁移、持久 ACK、读取原生历史，正常退出 `0`；未使用开发目录中的 Bun/SDK |

GUI 证据：[深色/紧凑](evidence/s3-dark.png)、[浅色/正常](evidence/s3-light.png)。已检查请求标题、原生 editor 预填及焦点、主题/密度，没有用 Computer use 重复已经自动化证明的逻辑。原生中文输入法候选窗仍待用户试用。

最后候选 `dist/s3-candidate/mac-arm64/d-pi.app/Contents/Resources/app.asar` SHA-256：`e70f7cf2a844ac766dc097e1cf5d55f635ef5bf404f393c676a72b8978a3bfc3`。源码构建于实现提交前，内嵌 Git 基线/dirty 信息与最终提交不强行等同；此内容摘要用于识别实测产物。

测试项目、配置、App 数据和本地 HTTP 模型 fixture 全部隔离，不调用个人模型服务。真实供应商、干净机器安装、签名/公证、Windows/Linux、M2 性能未覆盖。源码单写结论只支持拒绝恢复，不能宣称 SDK 已带执行全周期锁。
