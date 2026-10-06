# 产品与技术决定登记

更新：2026-10-01。本页是现行决定、状态、依据与取代关系的索引；详细行为以所链接合同为准。领域定义见 [GLOSSARY](../GLOSSARY.md)，界面用词见[产品术语](product-terminology.md)，完整需求与阶段见[需求](product/requirements.md)及[首版方案](product/first-release.md)。授权、工程完成、用户试用与认可由[所属规格](README.md#工作记录)维护，不由决定状态推导。

2026-10-01：用户明确将 OMP 升级目标固定为 **v18.4.5**，并认可[升级与边界加固规格](../.scratch/runtime-hardening-omp1845/spec.md)的完整推荐范围，包含编辑连续性；允许合理分工与适量 sub agent 并行实施。沿用 D-02/D-03 的官方 SDK 薄宿主与原生配置所有权，不改 D-08 并发与 D-24 冷恢复边界。当前实装仍为 18.3.0，方案认可不代表实现或产品试用完成；本会话先提交工作区，实施在新会话开始。

2026-10-01 实施修订：18.4.5 官方完整包的 SDK 导入歧义经 integrity/hash/真实 Bun 复现；用户允许升级固定 18.4.6，18.4.6 同样失败后明确授权随包 staging 单处 `ratchet/prelude.ts` 导入修正。仅此例外取代原样包要求，不改 OMP 行为/所有权；原包与补丁哈希入资源 manifest，完整证据见升级规格。

## 状态与变更规则

- **已确认**：用户明确决定或 accepted ADR，实施必须遵循；尚未实测不降为提议。
- **沿用基线**：保留的历史工程方向，按实际接入复核版本；不等于用户逐包确认。
- **提议**：尚未确认的推荐，写入文档不构成批准。
- **已取代**：保留旧依据与新决定引用；部分取代只影响明确列出的部分。
- **已验证**：固定版本和场景的证据属性，与上述决定状态、产品认可分开。

决定变更按 [AGENTS.md 的决定连续性](../AGENTS.md#决定连续性)处理，登记日期、旧 ID、理由、证据、影响及取代关系。有矛盾不能靠更新时间或措辞强弱裁定，未确认的改变不覆盖原决定。实施日志和历史授权保存在[整理前原登记快照](../.scratch/infrastructure-closure/evidence/decision-history.md)，不作为当前任务指令。

## 已确认决定

来源为 2026-09-24 起用户逐项确认；表内保留后续确认或修订日期。D-ID 保持稳定，后续细化不另行编号。

| ID | 现行决定 | 日期、依据与取代关系 |
| --- | --- | --- |
| D-01 | 最终核心体验成为 OMP TUI 的超集，基本覆盖适合 GUI 的原生内容与交互，渐进交付 | 2026-09-27 澄清：仅适合 TUI 的工作可不接入，具体排除须有依据；取代无条件全量承接的解释，全集不是首版前置。见[访谈](../.scratch/pre-coding-interview/spec.md) |
| D-02 | Electron Main / utility SessionHost / 独立 OMP；OMP 拥有执行和原生会话 | [ADR-0001](adr/0001-omp-session-client.md)；2026-09-28 用户选择[官方 SDK 薄宿主](../.scratch/m1-s3-control-recovery/spec.md)，取代 S2 仅依赖官方二进制 RPC 的实现限制，不改 OMP 源码或所有权 |
| D-03 | 随包兼容 OMP，复用原生配置，App 偏好独立 | [ADR-0002](adr/0002-share-native-omp-config.md)；取代依赖外装 CLI 与默认独立 GUI Runtime 配置，不依赖外部 CLI 可执行文件；2026-10-01 用户重申双向复用，正常 CLI 活动 WAL 不能阻断已提交凭据/模型读取，见 [修复证据](../.scratch/m2-first-release/configuration-sharing.md) |
| D-04 | 模型选择不设 GUI 白名单；已有可用配置免初始化，无配置用户 GUI 引导 | 2026-09-25 明确；D-23 随后收窄首批新增认证入口，已有其他可用配置仍复用 |
| D-05 | macOS 优先；拟采用 macOS 独占能力须报告原因、影响和替代方案，由用户决定 | 不宣称已完成其他平台兼容 |
| D-06 | 首阶段主对话闭环、只读文件与 Diff，后续编辑 | 取代第一阶段不含文件查看/专属 Diff 的方向；分阶段验收由 D-26 与[首版方案](product/first-release.md)收敛 |
| D-07 | Monaco 已选定，最终达到日常编码 B 档，重点 TS/JS/Node 项目 | 2026-09-25 取代 VSCode 服务层/完整工作台并列选型；不自动降低最终能力 |
| D-08 | 同项目多 Thread，可用项目原目录或独立 Git worktree；复用 OMP 行为，UI 明确当前 worktree/实际工作目录 | 2026-09-27 澄清：共用目录共享文件，子 Agent 临时隔离与 Thread 目录各有生命周期。M2 关联已有 worktree，创建/迁移/清理后续；已知跨 Thread 冲突须在整项副作用前阻止、提示并解决后重查。见[Thread 合同](architecture/modules/threads.md)及[访谈](../.scratch/pre-coding-interview/spec.md) |
| D-09 | Side Chat 旁路、只读代码、可追问、独立模型/档位、持久历史和显式同步 | 不自动改主 Thread；见[需求](product/requirements.md) |
| D-10 | 全部指定输入方式都是最终需求，输入体验是核心 | 文字/截图/图片/文件/PDF/@ 文件/选区纳入首版 M2；2026-09-27 确认基础输入体验，图片编辑与 Markdown 排版后置。粘贴可编辑 Markdown/纯文本、附件预览、链接图标和发送按键等细化见[Composer 要求](product/first-release.md#2026-09-27-用户明确的输入体验要求)；非 M1 全集前置 |
| D-11 | 普通发送排队；干预与停止独立。停止中断当前执行、暂缓本 Thread 后续队列并保留内容，明确继续才恢复；历史编辑/分叉/回退对齐 OMP | 2026-09-27 取代后续队列行为未定的方案；abort 回执不证明已停止，停止/会话回退不等于文件恢复。完整可视化、编辑、删除和重排纳入 M2，编辑时实际暂缓消费、不跳过后项；见[基础契约 §2](architecture/foundation-contracts.md#2-提交交接b2)。09-28/29 超时与上限细化见[下节](#2026-09-28交互超时默认作答与队列上限d-11d-24-细化用户明确指令优先) |
| D-12 | 浏览器支持预览、浏览与共享持久登录；computer use 后续 | 不做项目隔离账号环境，不固定只能一个页面进程 |
| D-13 | VSCode 式底部交互终端，Command + ` 唤起 | 不自动扩成接管 Agent 命令 |
| D-14 | Diff 是跨场景组件；Git Panel 自建 OMP 业务 GUI，Git 机制复用 | 2026-09-25 不建设完整通用 Git 客户端，不等待完整 Git GUI 大库；20/80 非工时承诺 |
| D-15 | 从设计起点预留 Agent Changes / Run Changes / Review / Revert | Run 边界、修改归属与 Revert 效果未确认，不能先绑定命令；当前来源合同由 D-20 约束 |
| D-16 | Codex 式常规布局，暂不分屏；统一图标；基础复制和段落 PNG 导出 | 取代自由分屏作为当前要求；图标库由 D-31 确认，PNG 导出实现未定，PNG 不是 AI 绘图 |
| D-17 | Biome 替代 ESLint/Prettier；S1 首个正式 GUI 接入 @shadcn/lint + Oxlint 设计检查 | 2026-09-27 取代条件接入设计 lint 的时机；不得关闭规则迁就违规，不覆盖用户项目格式化。见[设计系统合同](architecture/design-system.md) |
| D-18 | 保留旧基线证据，逐项复用，不直接恢复旧 UI | 2026-09-30 用户选择精准瘦身，取代归档“保持原样不动”和“整理不等于删除”的绝对表述；保留 26 个证据文件，移除 23 个无引用脚手架。保留文件与源提交一致，裁剪路径/哈希/理由及取回方式见[归档说明](archive/pre-reset/README.md)与 [manifest 的 pruned](archive/pre-reset/manifest.json)；归档仍非现行实现或执行指令 |
| D-19 | 方案先收敛并记录，再按用户明确阶段授权实施 | 2026-09-25 的“仅设计与调查”描述当时范围，后续明确授权可取代它；不由 Agent 自认批准，不以历史阶段限制覆盖新授权 |
| D-20 | 首版 Diff 交付 Git 当前差异与有原生证据的工具修改，明确标注来源；完整 Run Changes 和逐次归属后续 | 2026-09-25 用户接受“先保证差异来源准确”，由 P-03 转为确认；不将全部目录变化冒称 AI 改动。见[变化来源合同](product/first-release.md#3-变化记录先明确证据再展示-diff) |
| D-21 | 从开发开始覆盖 Electron 各层结构化日志、跨层关联和基础监控；日常无感，排查易读取/筛选/导出 | 2026-09-25 用户要求及轻量边界：异步、有界，默认无秘密/业务全文，不改 OMP 内部或重建其日志；专用日志界面后续。参数与验证见[诊断合同](architecture/diagnostics.md) |
| D-22 | 同一 trace ID 贯穿 Renderer/Main/utility 实际操作链；类型化异常、处理分工与基于证据的归因 | 2026-09-25 扩展 D-21；记录真实身份，未证实根因保留 unknown，OMP 返回错误不直接等于 OMP bug。见[诊断合同 §4](architecture/diagnostics.md#4-跨进程-trace-与结构化合同d-22) |
| D-23 | 首版 GUI 新增认证只做 OpenAI 账户登录与 DeepSeek API key | 2026-09-25 七项答复第 3 项，取代 D-04 的首批认证入口不限制策略；已有配置/模型复用保留。OMP 的 `openai-codex` 账户入口不同于 OpenAI API key |
| D-24 | 稳定身份与恢复、冻结原文和持久提交收据；unknown 不自动重发，缺执行全周期单写证据时恢复只读 | 2026-09-25 七项答复第 1/2/4 项；09-28 ACK 清稿与 prepared 显式继续的取代/补充关系见[提交修订](#d-24-提交与恢复的现行修订)。收据不创造原生幂等或 exactly-once；详细合同见[基础契约](architecture/foundation-contracts.md) |
| D-25 | 权限先简单；项目执行信任与 App 文件访问范围分开设置 | 2026-09-25 七项答复第 5 项及审查修订，取代混为权限层次的三档排列；新目录默认仅浏览，保留执行信任、额外文件读取和 App 完全访问，不冒称工具沙箱。见[基础契约 §5](architecture/foundation-contracts.md#5-最小权限与信任b5) |
| D-26 | 工程补齐输出/性能契约，区分 G1 验证、M1 内部闭环、M2 首版与 M3 后续 | 2026-09-25 七项答复第 6/7 项；预算是待实测工程目标，非逐项用户承诺。09-27 按 D-28 收紧验证投入；阶段和门槛见[基础契约 §8](architecture/foundation-contracts.md#8-开发入口里程碑与门槛b7) |
| D-27 | 子 Agent 合理默认模型/档位；会话内覆盖只影响当前 Thread 后续创建，目标支持跨供应商 | 2026-09-27 合理默认与 Thread 覆盖纳入 M2，取代全部后置安排；项目/全局设置显式选择，自动降档/调整确认/倒计时后置，不改 OMP 调度所有权。[Settings 验证](validation/settings-feasibility.md)未证明局部覆盖、热切换与真实跨供应商路径 |
| D-28 | 证据优先，仅关键未知按需前置实验，再交付无头功能与正式 GUI；功能/缺陷遵循 TDD，自动化为默认回归 | 2026-09-25 确认，09-27/28 细化：官方文档/固定源码/已有证据够则实现，取代每功能必做实验、重复完整矩阵及每项 GUI 都用 Computer use 的解释。原生/视觉必要证据或用户要求可用 Computer use；真实 GUI 与用户试用边界不变。见[无头功能合同](architecture/headless-features.md) |
| D-29 | 规则独立于 React/视图，以明确契约组合；业务与应用生命周期不依赖页面或 hook 挂载 | 2026-09-25 确认；规则、协调/接入、投影/查询、React 绑定与视图分工见[无头功能合同](architecture/headless-features.md)，延续 D-02 |
| D-30 | 不引入 XState | 2026-09-25 明确排除该候选；使用 TypeScript 显式状态转换和局部协调，不自研通用状态机框架 |
| D-31 | GUI 主图标用 Hugeicons，建立自有 Icon Layer | 2026-09-25 取代 Lucide 提议；免费 Stroke Rounded、自有语义 API、私有 SVG、无头边界及可访问性见[图标合同](architecture/icon-system.md) |
| D-32 | Base UI 为默认基础交互，积极复用 shadcn/ui 源码；共享设计事实只有一份权威定义，主题/密度集中传播 | 2026-09-26 取代 B-02 的 Base UI 否定结论，Radix 不再为并列默认；09-27 样式澄清：Tailwind/CSS Modules/普通 CSS 按工程判断选择组合，没有场景到技术的强制映射；权威值与派生关系单源，局部样式可就近存放。自有 API/token、Hugeicons 与 OMP 所有权不变。见[设计系统合同](architecture/design-system.md) |
| D-33 | Composer 用最小 Tiptap 与项目业务扩展，按需使用底层 ProseMirror | 2026-09-26 取代 P-02 的直接 ProseMirror 优先及旧 Lexical 默认路线；不预装整套富文本产品，输入体验单独验收 |
| D-34 | App 自有结构化数据用 SQLite，Main 集中拥有持久化 | 2026-09-26 取代“文件起步、不足再评估数据库”；数据库事务不覆盖附件文件或 OMP 接受，驱动与 Drizzle 分别判断。见[基础契约 §1](architecture/foundation-contracts.md#1-身份持久化与生命周期b1) |
| D-35 | ts-pattern 为应用业务分支默认范式，Zod v4 标准版为数据边界标准 | 2026-09-26 取代 ts-pattern 仅为复杂分支候选；判别联合、穷尽处理、schema 推导、严格类型与窄接口见[TypeScript 合同](architecture/typescript.md)和[项目 skill](../.agents/skills/d-pi-typescript/SKILL.md)，不用类型技巧或无意义包装代替业务模型 |
| D-36 | Desktop 保存 `system`/`zh-CN`/`en-US` 偏好，Main 解析并与 Renderer 共用 locale，只翻译自有展示文案 | 2026-09-29 用户指定完整[国际化架构](architecture/internationalization.md)为基准并授权 S4 前落地；语言不进入 OMP/SessionHost/Agent 请求，原生与用户内容保持原文。实施/试用见[切片规格](../.scratch/i18n-foundation/spec.md) |
| D-37 | Zustand 管 Renderer 展示状态及细粒度订阅，TanStack Query 管只读异步查询缓存；两库为锁定基础依赖，不按功能无限推迟 | 2026-09-29 用户确认既有自写 model + 直接 IPC 是实现缺口，保留外部行为迁移；取代[development-foundation](../.scratch/development-foundation/spec.md) 09-28 “不为名录补齐状态库”（`3faea9d` 未获用户确认的工程侧写法），并细化 B-01。镜像/缓存不拥有 OMP 执行、队列或历史；命令未知不交由 Query 自动重发，vanilla store 与 React 绑定分离。版本/迁移见[对齐规格](../.scratch/state-query-alignment/spec.md)，写法见[状态与查询 skill](../.agents/skills/d-pi-state-query/SKILL.md)及[无头合同 §4](architecture/headless-features.md#4-对外合同与状态工具) |
| D-38 | TanStack Router 管应用导航，注册路由树完整推导目标、params/search；路由属于 app/renderer，业务生命周期独立 | 2026-10-01 用户授权完整接入并要求无断言的顺畅类型推导、独立 review 和分批本地提交。memory history、文件路由、业务确认后导航、阅读页签保留挂载；不在 loader/preload 执行命令，不改变 Main/OMP 所有权。范围及验证见[路由规格](../.scratch/router-integration/spec.md) |
| D-39 | Effect v4 稳定核心用于原生连接生命周期，先接入 NativeSession | 2026-10-02 用户授权引入、验证后 commit/push，取代 P-05 中 Effect 仅为候选的状态。锁定 4.0.0；限定 execution/host 与 execution/main/transport，内部 Scope/Fiber/超时/释放，对外 Promise/DTO。不接管 OMP 执行、不重发 unknown，不替换 Zod/ts-pattern/Renderer 状态与查询。当前落地与验收见[Effect 规格](../.scratch/effect-native-lifecycle/spec.md)，不以选型授权推断全层迁移完成 |

## 沿用基线与提议

| ID | 状态 | 内容、依据与取代关系 |
| --- | --- | --- |
| B-01 | 沿用基线，部分细化 | React/TS/electron-vite/pnpm/Tailwind、自有组件 API/token、Zustand/Query、Vitest/RTL/Playwright/electron-builder；Zod v4 和 ts-pattern 由 2026-09-26 D-35 确认。原“按功能接入”中状态/查询基础依赖部分由 09-29 D-37 取代；按功能建立业务投影/缓存实例仍有效 |
| B-02 | 部分被 D-32 取代 | 2026-09-26 Base UI 默认交互 + shadcn/ui 源码复用，取代“Base UI 非默认、Radix 按需”；自有 API/token、React Aria 对照和 Beautiful UI/Tool UI 参考继续有效。见[库雷达](prototype/frontend-library-radar.md) |
| B-03 | 沿用基线 | Streamdown + Shiki 统一渲染方向，撤回业务 react-markdown 第二入口；确认方向不替代集成验收 |
| B-04 | 沿用基线 | 关窗继续、重开接回、真正退出协调与 Renderer 刷新不重启工作；2026-09-27 确认关窗保留队列编辑/暂缓，重开后由用户保存/取消；09-28 确认后台有活时关窗无须提示。来源见[GUI 原始证据](archive/stage1-evidence.md)、[基础契约 §1/§2](architecture/foundation-contracts.md) |
| P-01 | 已收敛 | 用户授权划分阶段，首版按 D-26 与[首版方案](product/first-release.md)；不代表依赖或性能已验收 |
| P-02 | 已被 D-33 取代 | 原直接 ProseMirror 优先、最小 Tiptap 有条件对照；2026-09-26 用户确认最小 Tiptap，不再作为备用默认。旧研究理由保留在[历史快照](../.scratch/infrastructure-closure/evidence/decision-history.md) |
| P-03 | 已转为确认 | 2026-09-25 用户接受准确标注来源的 Diff 交付顺序，见 D-20；保留编号追溯原提议 |
| P-04 | 提议，图标部分已取代 | Node/TypeScript 宿主、不自研第二后端语言；WebContentsView、xterm.js/node-pty、PNG capturePage 等仍按候选状态，Lucide 部分由 2026-09-25 D-31 取代。见[技术评估](../.scratch/product-requirements/technical-evaluation.md) |
| P-05 | 部分已确认 | 2026-09-26 [技术审议](architecture/technology-selection-review.md)的 Base UI/Tiptap/SQLite 由 D-32–D-34 确认，ts-pattern/Zod v4 由 D-35 提升为规范；2026-10-02 Effect 由 D-39 限定范围采纳。Drizzle、Pino/electron-log、Execa 等仍按各自候选状态，局部采纳不等于整套批准 |

## D-24 提交与恢复的现行修订

- **2026-09-28 ACK 清稿修订**：用户选择保留官方 OMP，取代“业务接受证据持久化后才能清稿”。冻结原文、prepared 与 dispatching 先落盘；有效关联 ACK 与对应草稿消费标记在同一事务持久化后，才清仍匹配的草稿，后来输入保留。`acknowledged` 不等于 `accepted`、原生历史持久化或执行完成；迟到错误独立展示，不撤销 ACK 事实、不自动重发、不把旧稿盖回新稿。选择理由、固定源码与代价见[S2 已确认方案 A](../.scratch/m1-s2-submit-read/acceptance-decision.md)，当前细节以[基础契约 §2](architecture/foundation-contracts.md#2-提交交接b2)为准。
- **2026-09-28 prepared 恢复补充**：Main/原生仍存活、Renderer 重建后，持久 prepared 仅由用户显式继续，复用原 submission ID 并重新核验目标/准入；不自动派发。清稿关联只恢复匹配原编辑，后来输入与 retryOf 当前草稿不消费。unknown 不自动重发、同版本防重及冷恢复无单写证明只读不变。见[S3 因果与恢复复核](../.scratch/m1-s3-control-recovery/causality-recovery-review.md)。
- **2026-09-28 本地草稿核对**：保存结果未知时只读核对同一 Thread 的版本，保留当前输入；证据一致才恢复保存，不同内容展示双方供用户选择，覆盖仍检查 revision。S1 正文上限确认为 UTF-8 4 MiB，超限提示并保留，已有大草稿仍可读。此机制不证明 OMP 接受，容量不是性能承诺。见[S1 巩固记录](../.scratch/m1-s1-project-draft/hardening.md)。

## 2026-09-28：交互超时默认作答与队列上限（D-11/D-24 细化，用户明确指令优先）

本节保留既有引用锚点，直接登记 09-28 追答与 09-29 澄清后的现行规则。详细实施和验证在[交互补遗规格](../.scratch/m1-interaction-hardening/spec.md)，以下不表示用户已试用或认可。

- select/input/editor 提问允许 App 超时默认作答：select 取首选项，input/editor 取预填值，无预填取消；原生无 timeout 时等待 120 秒，有则按原生期限并在请求删除前写出。卡片标识已采取的默认，浮窗保留。confirm 永不由 App 超时默认作答；扩展自带 timeout 时仍按官方语义以 false 结束并删除请求，App 如实展示 expired，无 timeout 才继续等待。
- 固定 SDK 18.3.0 首个 `extension_ui_response` 生效，重复/迟到回答被丢弃；请求无推荐默认字段，原生超时删除请求不发 cancel。默认由 App 定义，发出后不可撤回，用户后答作为新的 steer 追发指示，不冒称原生覆盖默认。断链/写失败的 unknown 不自动重答，unknown 提交仍不自动重发；此取代只限旧“超时不默认作答”的场景，不改其他未知/不支持处理。
- 队列上限 20 条；产生队列提示上限，达限禁用输入/发送，有空位恢复。停止后内容原地保留、暂缓后续消费，明确继续才恢复。
- 多 Thread 提醒沿用既定 M2 策略：待答/失败标记与不抢焦点提醒，App 不在前台时用已授权系统通知；完成默认仅标记完成/未读，完成通知可选，点击定位关联内容。关窗且后台有活无须另行告知。详见[提醒策略](product/first-release.md#多-thread-提醒策略2026-09-27-用户确认)。真正退出时非空队列的放弃出口仍[延期待决](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md)，不借上述决定清队列。

## 证据与维护入口

现行约束不依赖读者逐段推断历史。详细实现、构建与验证由[工作记录](README.md#工作记录)维护；[整理前快照](../.scratch/infrastructure-closure/evidence/decision-history.md)保留完整修订及授权经过，原始归档按 D-18 保持可追溯。2026-09-26 审计中的内容信任、RPC 输入分帧与模型模态补充仍在[基础契约 §4/§5/§9](architecture/foundation-contracts.md)，没有因整理撤回；无新增 ADR 或产品决定。
