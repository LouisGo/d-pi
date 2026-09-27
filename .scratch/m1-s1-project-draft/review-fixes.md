# S1 commit 复审修复与架构核对

日期：2026-09-27。用户要求修复对 `7bdd139` 的两项复审发现，验证后本地 commit，并说明进度、核对架构。沿用 S1 授权，不启动 S2、不推送；没有新增产品待决项或技术选型。

## 修复结果

- **复制/剪切原文**：Composer 与回归测试共用最小 `plainTextEditorOptions`，使用 Tiptap 公开的 `coreExtensionOptions.clipboardTextSerializer.blockSeparator` 将剪贴板分隔符设为单个 LF，与现有保存及粘贴规则一致。没有自建另一套复制器或修改依赖源码。
- **启动存储重试**：Main 中集中初始化存储；初次 `restore` 与“重新检查”调用同一路径，已有服务直接复用，失败才在下一次恢复请求重新打开。每次失败更新机器错误码；数据库和原有身份不重置。`save` 等命令不触发重开，不自动重放结果未知的写入。数据目录创建也在这条可观察失败路径中。

## 本轮验证

- `pnpm check` 通过：严格类型、Biome、设计 lint、六类设计反例、token/导入边界以及 6 文件/15 项测试。
- 新编辑器回归使用正式最小 Tiptap 配置与其真实剪贴板插件，覆盖完整 Markdown、连续空行、末尾换行、部分跨行选区，以及剪切后粘贴还原。
- 新 Main 回归仅替换 Electron 窗口外壳，执行产品实际 IPC handler 与真实 SQLite：独占锁使首次恢复失败；解除锁后保存命令仍不能绕过初始化；再次恢复得到同一 Thread、revision 和正文。
- `pnpm build` 通过。沿用已有 Zod 纯注释处理和 Renderer >500 kB 提示；本轮没有增加依赖，不将打包提示当作性能退化证据。
- 真实 Electron 运行本轮生产构建，使用独立 `/tmp/d-pi-review.iJDBTv`：先以同名目录阻止 `drafts.sqlite` 打开，看到“本地数据暂不可用”；移除这一本轮空阻挡目录，点击“重新检查”即进入正常界面，不退出进程。
- 随后原生输入 `first\n  second\n\nfourth\n`，执行 ⌘A/⌘C/⌘V 和 ⌘A/⌘X/⌘V，SQLite 回读均逐字一致。Thread 为 `1c490899-54c0-4d03-afae-6563c70bb10f`，最终 revision 3；正常 ⌘Q 退出码 0。未改用户试用数据，原有试用窗口保持运行。

本轮复用已有 IME、主题/密度、打包驱动及性能基线，没有重跑全套故障或性能矩阵。源码和 `out/` 已更新；既有 `dist/s1-candidate` 的 0.1.0-s1.3 试用包未替换，不能据此声称旧包包含修复。可用 `pnpm dev` 试用当前源码；用户体验认可仍待反馈。

## 架构核对

结论：在已经实施的 S1 范围内，没有发现需要改变原设计的实质偏离；两处缺陷是既定输入/恢复合同的实现遗漏，不是另选了一条架构路线。

| 已定方向 | 当前实现与判断 |
| --- | --- |
| D-02/D-24/D-34：Main 管稳定身份和 App 持久化 | `main/draft-service.ts` 管目录准入/操作，`main/storage.ts` 独占 SQLite，执行 revision CAS。`main/index.ts` 组装窗口、受限 IPC、服务和关闭流程；本轮恢复仍由 Main 负责。 |
| D-29/D-33：编辑机制与业务规则分开 | Tiptap 拥有正文、选区、撤销；`features/draft/controller.ts` 是不依赖 React 的待保存快照/回执协调。该协调在 Renderer 是输入捕获与保存反馈，不是另一份数据库权威；Main 仍决定身份、版本和落盘成功。没有把业务数据删除或后台工作挂在 React 卸载上。 |
| D-17/D-31/D-32/D-35：既定技术栈和视图边界 | 单应用 Electron/React/TS；Base UI、自有 Hugeicons 层、最小 Tiptap；Zod v4 边界、ts-pattern 业务分支、Biome 与限定设计 lint；统一 CSS token/主题/密度。未新增框架、ORM、全局事件总线或平行实现。 |
| D-21/D-22/D-25：诊断和权限从首条链路落实 | Renderer 发起 traceId，经 preload 到 Main，日志保留请求/连接/阶段；失败返回结构化结果。目录经 Main 规范化，选择项目只记录 browse，不执行项目代码。日志不记录正文；仍不能将 browse 称为工具沙箱。 |
| 分阶段建立 Main → SessionHost → OMP | 当前 S1 仅有 Main/preload/Renderer，没有 SessionHost/OMP。这符合 spec 的明确排除项；不能将当前 IPC 保存链路当成未来 OMP 流式通道，也不能称完整进程架构已经验收。 |

模块地图是职责设计，不要求现在一模块一包。当前少量文件能保持上述边界，不需要为凑目录结构拆成完整平台。S2 接入执行时应沿用原方案：Main 管持久收据，SessionHost 管协议关联与连接，OMP 管执行；不要将执行循环塞进 React 或现有草稿 controller。

## 当前进度（面向下一次接手）

S1 已能选择目录、建立稳定 Thread、编辑并保存文字、关闭重开恢复，具备基础主题/密度及失败提示；两项复审修复已完成工程验证，尚待用户试用认可。它目前是一款可靠性逐步收敛的项目草稿应用，还没有开始让 Agent 干活。

S2 是首次真实发送与阅读；S3 补控制、队列/交互及执行故障恢复；S4 接只读文件、选区与可信 Diff；S5 才做 M1 整体闭环验收。S1 完成不能表述为 M1 已完成，也不能按切片数量推算进度百分比。现有 Runtime 可行性记录只作后续接入依据，不等于产品集成已完成。
