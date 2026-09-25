# OMP Desktop 架构与渐进交付

本页整合 `6fab3ef` 的[原架构稿](../archive/pre-reset/docs/prototype/v1-architecture-draft.md)与本轮需求。已确认决策、待验证方案和历史实现分开记录；当前工作区没有产品应用，不将历史验收冒充当前应用验收。

## 继续沿用的架构与工程方向

- Electron Main 管窗口、系统集成与进程监督；utility SessionHost 管 OMP 连接、请求关联、会话镜像与同步；OMP 管执行、工具和原生会话；Renderer 管交互。依据 [ADR-0001](../adr/0001-omp-session-client.md)。
- 沿用一个 utility SessionHost 管多个 OMP 的基线，接受 Host 公共故障域。
- 一个活跃顶层会话对应一个独立 OMP 进程，同一会话连续对话复用进程；不是每条消息启动新进程。多会话并行已有[限定实测](../validation/runtime-feasibility.md)，子 Agent 仍由 OMP 管理。
- Renderer/preload 与 SessionHost 使用受限 MessagePort；Main 建立通道，不逐条转发流式内容。OMP 使用 stdio RPC；不直接把 Bun SDK 塞入 Electron Node utility process。
- 不为 OMP 接入另建 HTTP Server。编辑器已选 Monaco，不引入完整 VSCode 工作台服务作为默认架构。
- React、TypeScript、electron-vite、pnpm、Tailwind CSS、自有组件层、Zustand、TanStack Query、Zod、Vitest、React Testing Library、Playwright 与 electron-builder 在旧稿已有选择记录，恢复为既有工程方向，不再当作从未讨论。接入时复核版本与必要性，未用到的库不预装；质量工具由本轮 Biome 决策替代。
- 单应用组织，目录按职责建立，不提前拆平台型 monorepo。Renderer 不直接依赖 Node 文件系统/OMP SDK；preload 不承载 Agent 业务；Host 不依赖 React/DOM。

## 应用诊断基础（D-21）

从第一条业务链路建立各层结构化日志和基础监控，详见[轻量诊断设计](../architecture/diagnostics.md)。公共事件/上下文契约贯穿 Main、preload、SessionHost、Renderer 和功能模块；Main 管设施生命周期，异步批量落盘，资源有界。跨进程显式传播统一 traceId，以 span、请求/会话及实例标识补充阶段关联，不把日志当成第二份 OMP 会话或产品 Run 真相。

日常无感是验收目标，需要实际性能对照验证；不建设完整观测平台。日志文件与按范围读取/导出基础先行，专用日志 UI 后续可做，不能作为首版前置。OMP 内部机制不改，只观测接入边界。每个组件随实现交付诊断能力，而非事后补日志。

D-22 进一步要求类型化异常与明确处理职责：发现层、错误报告来源、根因判断和恢复责任分别记录；Host 保留 OMP 原生错误证据，不能把应用适配异常归给 OMP，也不能把所有 OMP 报错判为 Runtime bug。跨 IPC 使用可序列化错误合同与运行时校验；诊断不改变现有 Main 建通道、Renderer 直达 Host 的业务数据路径。

## 状态与通信契约

- OMP 原生会话是事实来源，GUI 不用消息数组重建另一份 Agent 历史。
- Zustand 承载实时展示镜像；TanStack Query 承载模型列表、配置摘要、历史目录等查询缓存，本地 IPC Promise 也可作为查询来源。同一条消息正文不同时在两个可写缓存维护。
- 输入撤销栈与选区由输入组件管理；草稿、面板、阅读位置是 App 自有数据，集中持久化，与 OMP 数据分离。
- GUI 通信信封包含会话身份、请求 ID、实例代次及更新序号；快照与后续增量衔接，缺口/旧代次触发重新同步。这是宿主契约，不声称 OMP 原协议拥有同名字段。
- 处理 UTF-8 跨块、JSONL 边界与 RPC v2 大帧；不能把一次 stdout 回调当作完整消息。流式文本合并必须在工具、交互、终态之前刷新；后台继续读取，传输与镜像保留有界。
- 已接受、已开始处理、已完成必须区分；结果不明的副作用请求不自动重发。

## 保留的产品与生命周期决定

- 关闭窗口继续运行，重新打开接回现有会话；Cmd+Q/退出菜单才是真正退出。有未完成工作时提供等待、停止后退出、取消；旧决策与对应实测均保留，见[证据](../archive/stage1-evidence.md)。
- 普通发送默认排队，干预与停止是独立入口；停止不等于清空 OMP 队列或回滚文件。历史 v18.3.0 受控实验已观察到 abort 后 follow-up 保留、存在 steer 时可能继续消费，不能再笼统记为未调查。
- Renderer 刷新不重启任务；OMP/Host 异常退出标记中断，处理旧进程后显式恢复原生记录，不承诺接回旧 stdio 进程或自动续跑。
- 目标支持原项目目录与独立 worktree 两种工作方式。共享目录意味着共享文件；原生会话历史独立不提供文件隔离。同一原生会话不允许多执行进程双写。
- 原生会话路径不代表已落盘；没有模型时也不能伪报 ready。这些是旧原型已经发现的边界。

## 被后续决定取代或仍待验证的内容

| 旧内容 | 当前处理 |
| --- | --- |
| 依赖用户另装 OMP、缺失时下载初始化 | 应用携带固定兼容 OMP，默认共享原生配置，遵循 [ADR-0002](../adr/0002-share-native-omp-config.md) |
| ESLint + Prettier | Biome；仅 @shadcn/lint 配套引入 Oxlint |
| 流式纯文本、结束后 react-markdown | Streamdown + Shiki 统一内容呈现方向 |
| 首阶段不含文件树/专属 Diff | 最新首阶段包含只读文件查看和 Diff，编辑能力渐进增加 |
| 单项目单会话 M1 排除项 | 是旧里程碑限制，不是最终产品限制；多 Thread、附件、浏览器、Side Chat、Git 都保留在最终目标 |
| 分屏 | 当前暂缓，采用常规三栏布局 |
| 固定 Bun ConfigHelper | 仅为历史候选，先复用已验证原生配置/RPC；有实际认证接口缺口再评估助手，未验证就不建常驻实体 |
| Base UI 历史依赖 | 原应用已移除，不因此改变自有组件层方向或重新默认采用 Base UI |

新用户全 GUI 认证/模型配置仍是旧方案中的体验目标，Runtime 随包不等于登录流程全部完成。2026-09-25 模型选择不设置供应商白名单；随后 D-23 将首版新增认证限于 OpenAI 账户登录与 DeepSeek API key：已有可用原生配置直接进入，无配置用户使用 GUI 分步初始化；秘密输入、OAuth 等原生认证分支、取消与重试仍需验证，不能宣称已有通用认证助手。

## 渐进交付与组件建设

第一阶段围绕打开项目、输入需求、观察执行、回答交互、只读代码/Diff 检查和继续/恢复会话交付可用成果。编辑、语言服务、浏览器、终端、OMP Git Panel、Side Chat 等按依赖逐项加入，不要求先做全集；具体验收清单以[当前需求](../../.scratch/product-requirements/spec.md)和后续阶段规格为准。

技术组件采用成熟实现，业务组件承接 OMP 真实信息；自有组件 API 和设计变量保持一致。历史库雷达中的候选继续可查，不预装全部依赖，不先搭空泛平台。Monaco 集成与直接 ProseMirror Composer 是重点验证项；最小 Tiptap 只在具体问题触发时对照，见[技术评估](../../.scratch/product-requirements/technical-evaluation.md)。

## 验证与已知缺口

保留真实客户端验证的旧约定：协议 fixture 验证边界，真实 OMP/可见 GUI 验证用户路径，两者不能互相冒充。优先核实变更所影响的契约，不无理由重复所有已通过实验。

历史存在开发态与打包 GUI 实测、9 项 Runtime 检查、6 项 Settings 补测及最小随包实验；目前无产品源码，故这些是复用设计的依据，不是新实现通过证明。真实中文 IME、长输出/背压、大帧端到端及部分审批/故障路径尚未完成；原验收清单保存在[旧 M1 规格](../archive/pre-reset/.scratch/omp-gui-m1/spec.md)。

## 2026-09-25 接入方向修订

Monaco 已选定，保持只读先行和最终 B 档；语言服务优先复用成熟实现。Git Panel 自建围绕 OMP 工作流的 GUI，底层复用 Git 实现，预留 Agent Changes / Run Changes / Review / Revert；不以引入完整 Git GUI 大库为前提。Run 与改动归属、Review 状态、Revert 作用对象尚未定义，不将这些名称冒充 OMP 已有稳定领域对象或已完成能力。详见[需求增量](../../.scratch/product-requirements/spec.md)。

## 基础契约继承与闭合

[基础契约](../architecture/foundation-contracts.md)集中定义稳定 Thread/原生会话/工作目录/进程身份、单写、提交收据、内容冻结、配置上下文、权限、背压恢复与阶段验收。恢复旧稿有效约束：浏览历史不启动 Runtime，排队/待交互/后台任务不能按空闲回收；App 元数据版本化集中原子写；Finder 环境差异显式处理；等待退出仍可答交互；Renderer 禁用 Node 并启用隔离/sandbox；不可重读输出保留必要补充及缺口。不是建立第二套 OMP 执行事实。

## 无头功能与全局应用（D-28–D-30）

2026-09-25 用户确认按功能先验证、再无头功能、最后正式 GUI，组件化涵盖规则与流程。中间层区分业务规则、协调/接入、状态投影/查询及薄 React 接入；应用、Thread、Renderer 连接和具体视图各有生命周期，组件卸载不停止后台任务。**不引入 XState。** 职责、组合方式与验证标准统一见[无头功能合同](../architecture/headless-features.md)，不将所有逻辑装进 hooks，也不迁移 Main/Host/OMP 所有权。
