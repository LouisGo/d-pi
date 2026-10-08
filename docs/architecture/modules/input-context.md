# 输入与上下文

## Composer 异步导入补充（2026-10-08）

Thread-owned `AttachmentImports` 管 batch/job、读取预算、失败和结算；React 只订阅 projection。外部混合粘贴先立即应用文本，文件以稳定顺序在映射原位置应用一个独立 PM 事务，实际完整 doc 匹配才采用。Renderer adapter 持有 left-affinity target；原始文本被删除/撤销、可信替换、历史结束或视图解绑使其永久失效。随后独立输入的 Undo 与纯引用标签刷新不撤销原意图，失效结果保留在原 Thread 等待显式插入。自动完成不抢焦点；显式成功采用恢复 editor 焦点。

每 Thread 至多一个读取/prepare，窗口最多两个活动工作、100 MiB 原始 File 与64个 job；每批最多32文件、每 Thread 最多32批。准入在 await 前预留；读取显示真实 FileReader progress，Main 转换只显示阶段。部分失败不自动采用子集；失败PDF可预览，并通过原ID显式 text-only 确认后再插入，不重新转换来丢失同意。

`import-bytes.operationId` 与 `import-settle` 是窄 Main 结算补充，不借用 clipboard discard。Main 按实际 document/Thread 验证、固定 result IDs 和当前 manifest 采用；取消后晚到结果只结算。排队取消和 FileReader abort 可立即结束，Main 已接受的工作保持 cancelling，直到 release ACK。dispose 不把未结算义务留给已销毁 Thread；Main document teardown 统一回收。原 draft/history/clipboard/submission/native queue 合同继续有效。具体边界、证据和未验证项见 [Composer 规格](../../../.scratch/composer-quality/spec.md)。

项目动态文件/目录详情复用Main已有受控只读readReference，读取后复核Thread/root身份，遵守25MiB来源与64KiB UTF-8预览预算；只展示当前内容，不写manifest/私有对象、不新增执行权限或作为发送冻结内容。PDF已有派生摘要预览优先。原生dialog先同步close释放modal，再恢复经映射且仍合法的editor选区/焦点；取消与关闭按钮同路，owner变化/销毁/替换不恢复旧视图。

## T3 基础输入重构合同（2026-10-07）

ThreadModel 组合无 DOM 的 AttachmentModel，统一拥有来源请求、失败、显式重试和未插入的准备结果；浏览器 FileReader 留在 Renderer adapter。正式控件仅订阅并发出意图，卸载不销毁来源。Main 操作回复中的准备状态保留最多 128 项只读投影，按当前 DraftController token IDs 检查已知失败/未覆盖 PDF，移除正文中的来源不会被无用资产阻塞；恢复或淘汰后的未知资产始终由 Main prepare 权威校验，查询列表不形成第二份可写事实。发送在草稿捕获前、捕获准备时及捕获返回后复核同一 readiness。关窗冻结所有活 Thread 的来源入口，保存后再次核对，只有当前幂等 attempt lease 可释放；导航期间沿用原输入屏障。Main save 仍只接受 active Thread；正常切换先 flush，inactive owner 收到迟到正文而未确认时，关闭拒绝并给出侧栏已有会话短 ID，切回保存或解决该 owner 的失败后再重试，不扩大后台写权限。

编辑事务在 history 应用前按输入、删除和独立用户动作分组；IME replacement 仍是输入，粘贴/剪切/拖入/插入或重排引用各自成组，元数据刷新不入 history。消费和外部版本替换清除历史，窗口缓存继续按 revision/sequence/text/schema 恢复；不引入第二份可写正文。

窗口 editor epoch 在 Main 注册有限的历史资产租约，验证真实 Thread manifest，保护该 epoch 中曾可撤销的来源超集；租约不得通过剪贴板路径或摘要直接授权读取。历史清除、缓存淘汰和窗口释放解除租约。取得保护后才能持久化移除最后引用；失败时保留待保存正文和历史，阻止提交、切换和关闭，显式重试可恢复。最多 9 个 epoch（当前编辑器和 8 个缓存），每个 128 个来源、所有 epoch 合计 256 MiB 不重复对象；达限不静默删除 Undo 负载，按既有编辑缓存合同清除该 epoch 历史后再释放，当前正文保持。资产二进制不进入撤销栈。

同一 attachment ID 的 Main manifest 在重试或发送准备时可能新增 input/derived digest。Main 在发布处同步预检所有持有该 Thread/ID 的历史 epochs，按 Renderer document 的 distinct-object 预算原子补齐保护，并触发 transient epoch；保持旧摘要超集与 Renderer version，不依赖视图重新 observe ID。超预算拒绝发布，旧 manifest/lease/Undo 不变，返回准确 `editor-history-limit`；用户可显式清除当前 Undo 并等待旧 Main lease 释放后重试，不自动清历史来完成附件重试。新增对象尚未采用时仍按原导入/准备租约合同处理。

Main 将 transient lease epoch 纳入 GC 在 await 后及实际 unlink 前的所有权复核，记录集合是删除防护而非第二份资产权威。租约由当前 Renderer document 及 Main service 生命周期持有，渲染器 reload 或服务关闭释放；草稿/收据/unknown 的持久引用仍按原合同保护。租约 acquire/update/release 走类型化附件入口，重复释放幂等，旧 epoch 请求不能改写新 epoch；原草稿 DTO、SQLite 接受事务与 OMP 执行不变。

日期：2026-09-27。深度：M1 文字/选区主干，M2 全部指定输入。依据 D-10/D-24/D-33；[Composer 方案](../../product/first-release.md#2-composer最小-tiptap-与项目业务扩展)、[基础契约 §4](../foundation-contracts.md#4-内容包与附件b4)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- 草稿合同与状态在 `src/modules/input/contracts/`，控制器与引用序列化在 `src/modules/input/core/`，草稿仓储与服务在 `src/modules/input/main/`，编辑器适配在 `src/modules/input/renderer/`。
- M2 文字增量（2026-10-01）：普通剪贴板结构转为可编辑 Markdown；明确纯文本入口保留 literal source，剪贴板模板不挂载/不获取资源。标题、嵌套列表、表格、链接、代码/引用及一笔撤销/重做已由行为测试覆盖；2026-10-02 已接入附件粘贴/拖入与私有准备，详情见下方近期切片；V1-04 全集仍未完成。
- 应用级 Composer 组合留在 `src/app/renderer/workbench/`，不复制草稿真相；提交收据与 OMP 消费仍归 execution。

## 范围与拥有者

Renderer 的最小 Tiptap 实例拥有文字、引用节点、选区和撤销；Main 的输入功能协调持久草稿、附件准备与内容冻结。[存储](app-storage.md)提供事务/私有文件能力，[执行](execution.md)拥有提交结果。编辑器内部 JSON 不成为全应用或 OMP 的永久协议。

输入功能可独立于正式页面测试草稿、捕获和准备规则；编辑机制本身可依赖 DOM。卸载视图释放 editor 和监听，不顺带取消已经开始的宿主准备任务。

## 交接

| 输入来源 | 捕获与处理 | 输出给谁 |
| --- | --- | --- |
| Tiptap 编辑快照 | 映射为版本化草稿 DTO；保存比较预期版本，不维护另一份可写正文 | 存储、恢复后的编辑适配 |
| [Monaco 选区](files-editor.md) | 按基础契约 §4 冻结文字、路径、行号与来源版本；Diff 选区沿用所选侧内容 | 草稿引用、后续冻结内容包与来源说明 |
| @ 项目文件 | 保存资源引用并标注发送时读取；准备时经授权文件接口读取冻结 | 冻结内容包 |
| 粘贴/拖入的图片、文件、PDF | 导入时复制到私有内容存储；转换记录来源、版本、输出形式和覆盖缺口 | 草稿附件及预览 |
| 提交意图与对应编辑快照 / 执行 | 确保草稿版本与快照一致，等待所有必需内容 ready；按实际模型/传输约束预检 | 不可变内容包或可定位的准备失败 / 执行 |
| 已持久化调用确认与消费标记 / 执行 | 只清理该次提交对应版本；新编辑不受影响 | 当前草稿与可恢复提交入口 |

原生 payload 的字段和编码由[宿主适配](runtime-host.md)核对；输入模块提供确定内容及来源，不能把任意文件对象直接交给 OMP。编码后容量与实际图片支持在派发前检查；目标模型/上下文改变导致预检失效时重新准备，不悄悄转换内容。

## 状态、生命周期与失败

准备状态为 preparing / ready / failed，ready 只说明可交接内容已准备，不代表 OMP 已接受。编辑草稿产生新版本，不能改变已冻结内容；排队后也不跟随磁盘变化。

准备失败保留草稿并定位失败项，允许显式重试或移除。取消本地准备和取消已经派发的操作是两种动作；派发后的结果由执行模块处理，不能撤销准备就显示“未发送”。附件二进制不进入编辑撤销栈，移除一次引用不立即删除其他草稿/收据仍需的内容。

不支持的模态、损坏附件、越权或缺失文件不能以空内容、截断或只发文件名替代成功。PDF 按原生可靠通路或明确转换处理；扫描/图表信息损失要可见。容量与回收数值只维护在基础契约。

2026-09-27 用户进一步要求以显式状态转换处理切换模型与多媒体输入的组合，沿用 D-29/D-30，不引入 XState。附件是否已准备、当前模型是否兼容以及是否已提交是不同事实；切换模型不能使已保存内容消失，旧目标的检查结果不能把新目标误标为可发送。具体表示与转换在对应切片细化，不新建通用状态机框架。

## 第一批交付与验证

M1：文字、换行、选区引用、草稿恢复和版本正确的提交。最小真实编辑界面验证中文 IME、引用节点的选择/删除/撤销和焦点，再接正式 Base UI/自有视图。2026-09-27 用户已确认可切换发送方式、默认 Enter 发送，以及展开编辑区后 Enter 换行/⌘Enter 发送；按 Composer 方案验证模式切换、IME/@ 候选优先级和编辑连续性，不再将发送方式记作未确认建议。

M2：逐项补 @ 文件、截图、拖入图片/文件、PDF、预览与删除；核实实际 provider/transport，模型声明支持图片不等于传输不会丢图。

用户明确的编辑手感、多媒体预览与特殊路径检索要求集中在 [Composer 体验要求](../../product/first-release.md#2026-09-27-用户明确的输入体验要求)。补充样本包含可编辑的长短粘贴文本、桌面选区/光标/undo/redo、@message@List 等含 @ 路径、查询响应与过期结果、附件准备期间切换模型及切回。用户进一步确认图片查看/重排纳入 M2，裁剪/旋转/标注后置；各自接入时验证派生内容与预览、冻结提交版本一致。链接网站识别与图标展示纳入最初输入方案及后续 spec/ticket；可以后置的是输入框内 H1/H2、表格等 Markdown 样式的直接呈现，详见 Composer 方案；当前没有新增 GUI 或性能实测。

关键样本：候选确认不发送；附加后文件变动仍保留原选区；准备失败不漏附件；提交中继续编辑、切 Thread、刷新后不串稿；调用回执迟到不清新版本。编辑机制验收与无头规则验收分别记录。

## 窗口内编辑连续性（2026-10-01）

AppModel 拥有窗口级 DraftEditorCache，input Renderer 缓存脱离 EditorView/DOM 及插件闭包的 EditorState。A→B→A 在匹配草稿 revision、消费序号和正文时恢复选区与撤销，两个 Thread 独立；发送消费、外部新版本及旧 Editor 迟到事件不能复活已提交正文。最多缓存 8 个 Thread、总 UTF-8 正文估算 4 MiB，LRU 淘汰只释放编辑历史；原生 history depth 50 沿用其批次裁剪，正文估算不承诺 undo/RSS 硬上限。窗口释放清缓存，reload/重启只恢复 Main 持久草稿，不持久化 ProseMirror 内部状态。真实 Tiptap/React 红绿与原生候选检查见[05](../../../.scratch/runtime-hardening-omp1845/issues/05-editor-continuity.md)。

当前 Renderer 私有实现分别落在 `editor/`、`clipboard/`、`references/`；环境公开入口与草稿所有权不变。

## 2026-10-02 附件与发送时引用切片

input Main 的 AttachmentStore 管 schema 8 manifest、schema 9 对象投影、摘要原件/派生文件、准备与预算；Renderer AttachmentImports 属于 Thread，视图卸载不会取消导入，尚未私有落盘的原件在关闭时有保护。草稿只存原子短 token，不放二进制；@查询是只读Query，导入/重试/准备是显式副作用。

导入文本和图片复制原件；@项目文件每次发送经 files 授权读取及身份复核，冻结内容交给 execution prepared 持久化。预览文本最多64KiB并显示截断；该预览不用于发送。固定OMP18.4.6提供PDF文字转换，实际图表/扫描覆盖不能保证，必须显式仅文字；没有实现完整页面渲染。未知格式、解码、容量、权限和覆盖失败定位附件，完整保留原输入。

原件按摘要去重，来源仍保留各自 attachment identity。App 装配提供持久草稿、全部冻结提交收据与 queue_change 原来源的权威引用投影，input 不跨领域查询执行表。终态收据没有原生历史自持久证明，依赖永不因终态自动释放；unknown 不重发，冷 Thread 继续只读。

最后引用释放后至少保留7天；正式 GUI 的附件存储检查/清理可立即清除已确认无引用的原件与派生物。独立来源导入租约保护 RPC 完成到同一来源 token 持久化之间的窗口，共享摘要其他来源的持久引用不能接管该租约；本次进程中从未持久化的已完成导入保留到冷启动。准备中的冻结摘要保留到对应冻结收据持久化，检查、清理与导入/准备沿同一 lane 顺序执行。

检查流式校验对象摘要并分别标注原件/派生物缺失或损坏；保留草稿 token、manifest 和冻结收据以支持显式重试、重附与同摘要重新导入修复。每批最多32个对象、约32MiB 文件、32条 manifest 和128个权威 owner；来源报告最多128条。可续扫发现/引用未完成时报告进度并保守拒删，损坏/过大 owner 数据同样拒删。达到1GiB仍明确拒绝新增，不扩 PDF 视觉或 OCR。

正式 GUI 沿用附件管理、图片缩放、失败重试及@键盘选择，并提供附件存储检查/清理与受影响来源报告。关闭先停止后台维护，拒绝新操作，等待已经进入 lane 的导入/准备/扫描完成再关闭目录与 SQLite；尚在选文件对话框/读取外部文件且未入 lane 的请求在关闭后拒绝进入。后台失败只上报窄失败信号，由 Main root 记录 storage-unavailable。

附件被加入/移出持久草稿时，DraftRepository 在同一草稿保存事务内保守刷新受影响原件及派生物的释放时钟；扫描间的短暂重新引用不会继承旧七天期限。仍由维护重新读取权威引用，引用计数不成为删除授权。

附件 manifest 的可选 `draftBoundRevision` 是对应来源首次持久采用的 input 元数据，与草稿 CAS 同事务写入；重试发布旧 manifest 时保留该事实。维护在有界来源查询中据此解除同 Thread/attachmentId 的导入租约，不解除其他同摘要来源，也不把历史采用当作当前引用。冻结准备租约与原生自持久证明规则不变。

## 2026-10-06 文件与目录引用

用户明确要求@目录与文件区分。搜索DTO含path/name/kind，引用manifest及冻结来源的可选referenceKind为file/directory；旧manifest缺字段按file兼容。目录在发送准备时经files边界重新读取并冻结直接条目的JSON清单（名称与kind），不递归展开正文；超过500直接条目、越权或目录变化时失败保留输入，不把部分清单作为成功。原件库存/冻结租约继续保护实际发送的目录清单摘要；旧冻结内容不跟随磁盘变化。Renderer目录图标/类型文字与原子节点尾斜杠沿用同一类型。

Main服务拥有files的ProjectReferenceSearch实例，与附件服务一同close/drain；Query仅缓存只读候选，150ms合并连续键入，等待或查询身份不一致时不可确认旧候选，显式刷新使Main缓存失效。文件发送仍冻结原文件正文；不改变OMP执行或unknown/cold恢复策略。

04c 文件和目录发送读取共同保持 Thread 记录的规范项目根：读取前后检查根非 symlink、realpath 原值及 dev/ino/ctime，拒绝将变化后的外部规范路径当作原授权根。通用 files 浏览 API 的别名支持不构成附件发送授权；失败保留引用与草稿。


## 可信结构化剪贴板（T3 foundations 04）

2026-10-07用户已选择动态引用复制时冻结来源/版本。新合同在[spec](../../../.scratch/t3-foundations/spec.md#用户选项1复制冻结来源与版本)：Main按原Thread真实manifest沿原readReference权限捕获有界完整文件/直接目录清单，保留版本及来源并存入私有对象，export ready后目标永不回读项目。目标新ID与真实摘要（含PDF派生）参与snapshot→import→正文/history→持久采用保护；仅源数据可用且所有预算准入才发布，失败不生成半成品。正式GUI区分“复制时冻结”和原动态“发送时读取”。本段为已确认要求，实施状态以spec为准。

Copy/cut 同步捕获实际选区，写入 Main 预发 ticket（`version:1, instanceId, handleId, expiresAt`）的私有 MIME 与 HTML fallback；plain flavor 始终可读，附件显示名称和标识，不输出可解析的原 UUID token。无可用 ticket 时只复制可读文本并提示。随后异步export绑定一次性ticket：export仅包含实际选中节点的IDs，正文中的其他UUID token降级；Main校验依赖闭包和源Thread真实manifest。私有ready text/image/pdf-text按输入及派生摘要验证，冻结选区只搬自包含原文。动态@文件/目录沿原Thread的readReference权限、来源身份与格式/覆盖规则捕获可用私有表示；原manifest仍保持动态。冻结来源记录projectPath/path/kind/version/capturedAt，数据只作溯源；再次复制已冻结资产不重新读项目。来源不可用或准备失败沿显式可读fallback，不发布半个目标片段。

快照属于 Main 当前 app instance 和可信 Renderer document，Thread 切换不会撤销已复制快照；完整 document navigation、renderer 退出及 App service close 全部释放。每 document 最多 8 tickets、全局 32；ticket TTL 120 秒（reserved/pending/ready 都适用），每快照 32 个依赖及 1 MiB 选中文字、64 MiB 私有对象，全局 128 MiB。等待 export 每 ticket 最多 4、全局 16、最长 3 秒；队列内工作晚于 TTL/释放不会再发布或克隆。import（含等待/排队/执行）每 document 最多 4、全局 16，未持久采用的克隆交接最多 128，已采用时解除交接保护；timer 上限等于 ticket/等待预算，close 清除 timer 并结束等待。复制请求同步pin已有源digest，异步prepare在Main串行资源lane内按真实input/derived对象核验并同步重查预算、来源及TTL后补齐snapshot pin，再发布ready；失败释放该ticket全部pin/预算。GC不得穿过准备与发布的交接；现有editor epoch和持久草稿继续保护cut/保存前的源资产。

Paste 只解析严格版本和有界 envelope；未知、过期、伪造、跨 instance、准备失败、预算耗尽均显示可读 fallback。Main 校验目标 Thread；整片段验证成功后一个SQLite事务建立新目标附件ID，保留完整输入/派生record、冻结来源与私有对象去重。目标preview/prepare/reopen仅消费私有快照，不再回读源项目或目标同名路径，不访问任意路径或URL。Renderer 用原 Thread 的 AttachmentModel 跟踪 pending，并在同一消费 sequence、同一 editor doc/selection、仍 editable/current 且 source 未被冻结时执行一次 PM paste transaction；全部内容一次 Undo/Redo。迟到结果不落入别的 Thread 或已消费草稿，未使用克隆释放 import pin。显式纯文本粘贴仍消费 text/plain。正文唯一可写拥有者、保存和 03 history lease 不变。

公开 wire 使用现有 AttachmentBridge 的 clipboard-reserve/export/import/release/discard 命令与 clipboard-tickets/exported/imported/unavailable 判别结果。Clipboard failure 独立于附件内容失败（invalid/expired/busy/failed），不泄露 path、stderr 或业务全文到诊断。窗口内 adapter 只拥有可丢弃 ticket pool 和当前 paste attempt，没有第二份草稿或资产事实。


### Clipboard clone 交接与历史结束

成功插入尚未持久采用的 clone 继续由 Main 原 import pin 保护，不能提前仅交给异步 Undo lease。显式清史、缓存淘汰和 epoch 替换通过既有 `history-release` 发送可选 `leaseId`、`releaseIds`（该 epoch 的依赖候选，包括尚未确认或失败的 update）和 `retainIds`（当前真实正文依赖）。无 lease 的候选也可结束；旧调用缺字段只释放已验证的 lease，不新增 clone 删除授权。两个 ID 数组最多 80,000，覆盖 4 MiB 草稿正文 token 的上限；仅 ID 投影，不保存第二份正文。

Main 在同一个同步步骤释放可信 owner/Thread 的历史 lease，并仅回收该 owner/Thread 候选中不在 retainIds、也不被其他有效 Main epoch 引用的未采用 clipboard clone：解除原 import pin 和 128 交接额度。当前正文 clone 继续沿原 pin 保护，无重新申请历史 lease 的窗口；普通 PDF 等资产的显式清史/重试预算合同不变。可 Redo 时不结束 epoch，保持其 clone 保护。重复清史保留用于后续清理的当前 ID 候选；缓存淘汰以 DraftController 的真实当前正文提供保留集合，document close 仍释放全部 document 临时资源。清理 RPC 失败保守留 pin，来源保存屏障等待完成并允许显式重试。


清理恢复独立于当前 epoch 的更新：未完成的 lease/candidate cleanup 记录保留真实 leaseId 和候选集合，跨 reset 不丢失；新 epoch 成功 update 不能解除旧 cleanup 失败或保存屏障。update 的失败也独立保留，只有相应 update 成功或其 epoch 实际结束、以及所有 cleanup 实际完成后来源才 ready。显式 retry 和再次清史恢复所有未完成记录；每次清理重试以最新当前正文 ID 投影与当前 epoch 的保守 Undo/Redo 依赖共同提供 retainIds，包括尚未确认或失败的 update，不能使用旧清史时的正文快照删除新依赖。依然不保存第二份正文，分片 wire 上限和普通 PDF 清史预算恢复合同不变。


Cache 的 epoch 淘汰与 cleanup owner 销毁分开：未确认的结束保留无头 owner 与该 Thread Controller 的保存屏障，重绑和显式 retry 仍能恢复；仅全部 Main ACK 后移除。窗口最多9个 history owner（active、inactive cache、pending cleanup 合计），沿 document 的9epoch预算；达限不新增 owner、不丢义务，来源保持 history failed/limited，保存屏障拒绝持久采用。显式 retry 先恢复已退休 owner，再准入新 owner；未保存正文仍由原 import pin保护。退休状态不保留 Editor/EditorState 或正文副本，关闭文档仍由 Main统一释放。


待准入投影另有硬预算：最多9个 Controller、全窗口 candidate IDs 总计80,000；普通待准入 epoch 超128依赖时沿既有显式限额清史规则结束Undo。预算不足时 PM admission plugin 在 docChanged 前拒绝普通编辑，并通过独立 editable prop 表达暂不可编辑，不改变原 Thread readonly 选项；保存/clear/retry不会假成功。slot 的正常在途释放表现 pending，Main ACK 自动 drain 待准入来源，先移交真正 before/doc 的依赖并确认，才恢复保存；真实失败保持可重试。投影只有准入、实际ACK后的清理、或document disposal能移除，视图/EditorState淘汰不丢candidate。

`replaceDraftText` 是窄可信应用正文替换，消费确认与useStored沿显式PM meta通过admission预算门，不授予普通输入/clipboard该meta；替换后核对实际PM目标正文并清除旧Undo epoch。新可信正文来自现有Controller/App权威引用，仍可读；旧candidate义务保留，不能因一次command返回true而假称正文已替换。同Thread Controller重绑先以新实际正文接棒retention和保存屏障，旧controller/已销毁Editor不成为释放权威。

PM准入过滤可能拒绝dispatch；附件adapter必须核对实际doc是否等于目标transaction.doc，拒绝时返回false、让Thread AttachmentModel保留uninserted-source。可信clipboard同样核对实际doc，失败时明确反馈并等待Main discard未使用clone，不能把一笔被拒绝的dispatch当作已插入交接。

拒绝插入后的discard由Thread AttachmentModel持有必要清理失败，与已有源失败排队并保留原ids；一次unavailable/transport不能变成ready，显式retry只重试discard且仅其Main cancelled ACK解除义务，不重跑import。存在清理失败时不再申请clipboard import，Main每document最多4在途/128handoff给清理集合硬上界；普通源失败仍独立保留。必要cleanup不能用移除失败动作放弃，只能Main ACK或原document最终释放。

GUI 对必要 clipboard-discard 失败仅提供重试，隐藏移除失败请求动作。冻结选区也以实际 PM 目标文档确认应用；被拒绝时保留待应用意图，history 准入状态恢复后再尝试，同一请求确认后只应用一次。

Main 成功导入后，若因正文、选区、generation、前台身份或adapter/Editor销毁而未插入，同样由仍存活的原Thread AttachmentModel持有discard、失败及重试责任。失效的adapter不得绕过owner直接忽略RPC失败，也不得把clone重新插入新草稿。真正Thread owner销毁与可信Main document释放分别核对，不把二者笼统视为等价。

historyState供React外部订阅读取。没有history owner时的empty、pending admission、failed/limited admission均返回稳定快照；在途Main释放不得每次创建新对象。实际ACK后订阅通知状态变化，正常第十Thread自动从pending准入并恢复保存，无React更新循环。
