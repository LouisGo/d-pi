# S1 接入验证记录

2026-09-27，基线 5d4bdf6，macOS Darwin 27.2.0 arm64；系统 Node 23.11.0、pnpm 10.5.2。

## 固定依赖与源码

精确版本见 package.json / pnpm-lock.yaml。Electron 44.4.5 内置 Node 24.21.0 / SQLite 3.53.4 / ABI 149；采用 node:sqlite，不引入额外原生驱动或 ORM。此接口在当前 Node 仍输出 ExperimentalWarning，隔离在存储适配层；不把系统 Node 测试作为 Electron 证据。electron-vite 5 的 peer 范围到 Vite 7，使用 7.3.6。Tiptap 3.31.3 最小 Document/Paragraph/Text/UndoRedo。@shadcn/lint 0.2.0 + Oxlint 1.85.0 + Tailwind 4.3.3。

来源：npm 官方 registry；Electron 官方 release 下载，SHA256 对照随 npm 包 checksums.json：a212eee63ba2f45fd83bd28f77a3e3313a336ad17a4c25adf617942eef5e0e2c。自动下载卡住，curl 分段下载后验证完整校验值再解压；没有禁用校验或修改全局配置。

## 已观察证据

- `pnpm validate:sqlite`：真实 Electron Main 中 WAL/FULL、事务回滚、query_only 写失败、迁移 SQL 失败回滚、schema 版本不变、关闭重开均通过。独立子进程在事务中 SIGKILL，重开仍为已确认正文且 integrity_check=ok。仅证明此样本，不承诺每次按键零丢失。
- `node validation/s1/sqlite-node.mjs`：额外系统 Node CAS 样本，旧 revision 更新影响 0 行、不覆盖新稿；与 Electron 结果分别记录。
- `pnpm validate:design`：合规 CSS Modules / clsx / cva 通过，原始颜色、任意像素、组件内部覆盖、inline color、未知类和动态组件类反例被拒绝。仅 `p-[var(--panel-padding)]` 在 no-arbitrary-values 放行，其他规则保留。组件路径 `@/components/ui` 已登记 tsconfig 与 components.json。
- `pnpm typecheck` 通过；最小编辑器 Vite build 通过。Tiptap bundle 有 >500 kB 提示；不是输入延迟证据。
- 原生 Electron 窗口经 CUA 物理按键触发系统中文 IME，AX/界面观察 compositionstart/end 和中文“你好奥”进入正文；真实换行、粘贴文本、选区删除、⌘Z/⇧⌘Z 回退/恢复可见。CUA paste 曾读到恢复后的原剪贴板内容，故该样本只证明实际进入的多段文本可编辑，不证明工具指定字符串一致；后续正式 GUI 补确定性样本。没有用合成 DOM composition 事件冒充 IME。
- 实验窗口切深色/compact 后正文仍在、AX 焦点仍在输入区；Tailwind / CSS Modules / 普通 CSS 三种 primary 消费者可见同色。正式 GUI 的完整联动及源值改动仍留 03/04 验收。

## 覆盖边界

CSS 文件不在 JSX 规则完整覆盖范围；正式接入补窄 token/导入边界检查。用户试用未收到反馈；实验窗口不保存内容、不请求模型。真实正式 GUI、产品包、负载与诊断预算仍未验收。

## 正式 S1 路径（2026-09-27，本轮新增）

- `pnpm check` 最终为 4 个测试文件 / 11 项测试通过；包括 Main 目录选择并发保护、两 Thread 隔离、CAS/重启、迁移失败备份/回滚/未知版本拒绝、真实写锁失败、迟到回执/新编辑与显式重试、未知传输不自动重试、IPC 版本/字段/大小边界、日志洪峰与 Writer 故障。早期命令误扫描过归档测试，现 Vitest include 限定 `src/**/*.test.ts`，11 项不包含历史归档。
- 最小 SQLite 探针打成 macOS app 后执行通过；正式 `0.1.0-s1.0` 包内应用也取得 SQLite 落盘与恢复证据。
- 真实 CUA 原生操作：取消目录选择回到空状态；选择 `/tmp/d-pi-s1-project-fixture` 后 Main 显示规范化 `/private/tmp/...`，生成 Thread `db3b19b0-aa6c-4c63-9932-d94f23219147`；中文输入与第二行英文保存进 SQLite，主题/密度切换后编辑焦点仍在。
- 通过另一真实 SQLite 连接持有写锁；新正文保留、界面明确“尚未保存”，日志同 trace `ecebcebc-69fd-4c9b-b8ed-2ee628b72ab8` 记录 received/failed（约260ms，包含250ms busy timeout）。正常 Cmd+W 被保存保护阻止，解锁重试后 Cmd+Q 正常退出。再次启动恢复同一 Thread、完整新正文及 dark/compact；测试项目 postinstall 哨兵没有执行。
- 关闭切换 editable 的默认 update 导致额外 revision，已改为 `setEditable(..., false)`；后续包还加了 Main 关窗保留、并发选目录保护和机器错误码。变更后的最终 UI 复验仍被锁屏阻止，不能把旧包运行证据全部升级为新包验收。
- 单源 primary 实验：只将 tokens.css 的 dark `--primary` 从 #a8c1ff 改为 #95d5b2，三种样式消费者在真实 Electron 截图中同步变为绿色；没有修改调用处，随后恢复原值。焦点/正文保持的主题密度切换在正式包另测。
- `node validation/s1/icons-bundle.mjs`：直接引用自有 FolderIcon，同模块另有未引用太阳/月亮导出；生产 Rollup 对照中有输出的免费图标模块仅 Folder01Icon.js。正式 Renderer minify 后 JS 约572kB，仍有 >500kB 提示；不以体积推断输入性能。开发验证页不在生产入口。
- 48 份生产依赖图许可已汇总；shadcn Base Button 固定 commit/MIT/适配说明单独保留。打包不含 node_modules、实验入口或个人数据；SQLite 使用 Electron 内置模块，不依赖本机额外二进制驱动。
- `node validation/s1/export-diagnostics.mjs <logs> <traceId>` 已按上述真实失败 trace 导出两条白名单 JSONL；默认日志没有草稿正文。

截至锁屏前，正式 GUI 输入负载为两行短文本；未完成20000字、日志A/B和新版本完整视觉复验。候选构建与未验范围见 handoff.md；用户没有提供体验认可。

## 解锁后续验与最终交付（2026-09-27）

本节取代前文“锁屏待验”的当前状态描述，前文保留为阶段证据。01–04 现已完成工程验收并交付待试用；用户没有提供体验认可。

- 0.1.0-s1.1 恢复原有 Thread 与正文。Cmd+W 后 Main 仍存活，revision 4 不变，重开正常。约22099字符实际英文长输入已进入正式 Tiptap；原生 typeText 未完整注入直接传入的中文长字符串，该尝试不算中文长负载通过。中文 IME 继续采用前述真实候选输入证据。
- 长稿实际操作暴露整页无限撑长，已使用 token `--editor-max-height` 和编辑区 overflow 限制滚动。正式界面仍沿用单源主题/密度，未另设色板。
- 原生选择唯一片段后替换、Cmd+Z、Shift+Cmd+Z、再次撤销，均看到相应正文变化；原生 Cmd+V 的实际文本可编辑和撤销，但系统剪贴板在此期间被外部输入改写，预设复制字符串未一致出现，不能把该工具环节记为确定性剪贴板测试。撤销后保留此前草稿，未清空用户期间输入。
- 测量进程发现显式 Quit 后 Main 曾残留，日志 drain 回调的再次 quit 延至 `setImmediate`，让被 preventDefault 的 will-quit 先返回。修复后验证构建、开发实例及最终包均正常退出（进程退出码0）；不是只观察窗口消失。
- 最新0.1.0-s1.2包恢复同一 Thread（`db3b19b0-aa6c-4c63-9932-d94f23219147`）及22110字符正文；浅深/normal/compact切换后 AX 焦点仍为草稿正文；长稿滚动受限、状态与操作入口可见。重开后无编辑关闭 revision 保持20，Main仍存活；随后显式Quit退出0。
- 隔离编辑验证窗口中 Folder/LightTheme/DarkTheme 的16/18/20/24尺寸实际可见，浅色normal/深色compact无裁切或错色。已有免费图标树摇证据不变。
- `pnpm dev` 的 localhost:5173 页面正常渲染，开发 CSP nonce 兼容性已验证。单独把诊断目标 `logs` 设成普通文件，原生一次性警告“诊断日志暂时无法写入”出现；关闭提示后主题可保存，未重复弹窗，正常退出。没有动产品用户目录权限。
- `pnpm check` 在上述产品修复后通过（11项测试）；最终打包0.1.0-s1.2资源清单检查通过，无性能探针/测试/数据库，hash见交接。

### S1 当前负载诊断 A/B

Apple M1 Pro / macOS Darwin27.2 arm64 / Electron44.4.5 / Node24.21.0，Chromium版本见原始文件。复用产品Renderer、Main服务/IPC/SQLite，验证构建仅加入开关、被动记录和固定fixture；产品包无该开关。方法和复现见 `validation/s1/performance/README.md`。

先导测量每模式5轮×32事件，未预热；开启组有一轮p95=58.5ms、聚合47.3ms，关闭聚合28.7ms。不能据此称通过，原始记录保留在 `evidence/input-pilot.json`。据短样本抖动增大样本：预先固定2轮预热，随后交错开关各5轮×320可信输入事件，同一21099字符fixture、相同数字输入。所有轮次含预热仍保留在 `evidence/input-confirm.json`，没有择优剔除正式轮次。

| 指标 | 日志关闭 | 日志开启 | 当前样本判断 |
| --- | --- | --- | --- |
| 输入反馈代理中位数 | 2.0ms | 2.0ms | 相同 |
| 输入反馈代理聚合p95 | 9.1ms | 9.5ms | 增0.4ms，低于5ms增量/50ms绝对目标 |
| 逐轮p95范围 | 8.0–10.0ms | 8.5–10.7ms | 五轮均保留 |
| 输入样本标准差 | 2.77ms | 3.18ms | 记录波动 |
| 固定保存任务中位数 | 835.04ms | 832.04ms | -0.36%，未见超过3%增加 |
| 固定保存任务p95（5次最大值） | 843.25ms | 838.53ms | 标准差5.35/4.53ms |
| 每轮结束进程组RSS快照中位数 | 519.44MiB | 519.83MiB | 增0.39MiB，低于20MiB短程目标 |

输入计时是可信 beforeinput 捕获至 rAF 后下一任务的反馈代理，不是硬件显示延迟；不以合成事件证明IME。无头任务为32次edit×16ms间隔，等待真实300ms合并保存与回执，调用同一Controller/Service/SQLite/Diagnostics；它不是GUI完整任务或OMP任务。内存是app.getAppMetrics的进程组workingSetSize快照，存在GC波动（约507–546MiB），不能证明长期稳定内存。确认样本支持S1当前负载预算，不能覆盖冷启动所有抖动、M2多Thread/万条消息或30分钟负载。统计与方差全量保存在 `evidence/performance-summary.json`，原始任务数据在 `evidence/task-performance.json`。

## 用户反馈修复：Markdown 原文粘贴（0.1.0-s1.3）

用户提供的原文样本见 `validation/s1/paste/sample.md`（475字符，不人为增加文件末尾换行）。明确区分Markdown源文本、HTML转Markdown与Markdown排版；本修复仅为S1文字原文保留，不扩大后两项范围。

固定双MIME剪贴板经原生Cmd+V，在旧默认粘贴入口复现标记/编号消失：默认HTML分支优先于text/plain，最小schema丢富结构。安装源码 `prosemirror-view/src/clipboard.ts` 另显示默认文本分支用多个换行共同分隔，折叠连续空行。新适配优先使用存在的text/plain，按单个LF构造段落并一次replaceSelection；不执行Markdown转换。只有CRLF/CR换行正规化，没有trim或内容截断。

- 原生修复探针：paste事件text/plain等于475字fixture，编辑器输出逐字相等；一次undo变空，redo逐字恢复。探针Clipboard权限仅能通过自有按钮复制固定fixture，不进入产品。
- 新增2项回归测试使用真实ProseMirror状态/transaction/history，验证完整样本与额外末尾换行、选区中间替换、缩进/连续空行/代码围栏、CRLF正规化；全量5文件/13测试、类型、Biome、设计lint及边界检查通过。
- 正式0.1.0-s1.3包在 `/tmp/d-pi-s1-paste-roundtrip` 通过原生目录选择创建Thread，原生粘贴后SQLite正文与fixture严格相等（475字符，revision1）；Quit后重开界面保留Markdown标记与列表，状态已保存。正文hash/身份见 `evidence/markdown-paste.json`。
- 验证窗口与产品试用目录分开；旧用户试用窗口正常保存退出后更新包，重新打开原 `$HOME/Library/Application Support/d-pi-s1-trial`，没有替换用户草稿。旧版已丢失的标记不能靠升级恢复，需要重新粘贴原文。
- 当前包SHA256 `ff4d7fa70735ba7cb6458760e2666176205bbf13ad799d018d71c3a142f81fde`；未添加依赖、未推送。用户已反馈但修复效果尚未认可，05 resolved只代表修复验证及交付。
