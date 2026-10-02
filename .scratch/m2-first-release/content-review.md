# 附件引用与混合队列独立审查

2026-10-02。审查者未参与实现；初始只读，主 Agent 后明确授权新增本记录，不修改产品源码、不 commit。基线 `f56fc4a100b9a5dc6ead5f401372e8e40bf83af3`，范围为 `git diff HEAD` 及本轮相关 untracked 源码、正式 GUI 和行为测试。排除原有 README、环境门禁及其工具测试、`.scratch/environment-dependency-alignment/` 无关改动。

依据为 M2 spec、04a/05c、D-24、基础契约 B4/B5；使用 code-review skill。第 6 项在追加 GUI 审查发现后已修复，22:37 最终定向复核无待修 P1/P2。结论限于所读源码与下述行为测试，不替代 macOS 候选验收、付费 Provider 验证或用户认可。

## 确认问题及修复复核

1. **P2：发送准备失败丢失具体原因与附件身份。** 初始 `RuntimeService.submit` 将缺失/越权引用、编码后容量等失败统一为 `content-not-ready`，正式输入区仍显示 ready/发送时读取，无法定位失败材料。现 `SubmissionFailure.preparation` 保留类型化 reason/attachmentId，具体 UiMessage 跨 Main/Renderer 传递，正式附件区显示对应来源与处理提示。Main 回归确认失败不建立收据、不 dispatch，并完整保留草稿；GUI 回归确认失败来源可定位。
2. **P2：合法大文本无法跨 IPC 预览。** 初始 Store 对最大 25 MiB 文本返回完整预览，preload reply schema 仅接收 1 MiB，点击预览抛解析错误。现预览按 UTF-8 边界限制为 64 KiB，并显式携带 `truncated`；合同/preload/正式预览提示均接入。跨真实 bridge/service 的回归确认大文本预览可读，发送仍使用完整源内容并按实际传输预算拒绝，未把预览截片冒充发送原文。
3. **P2：新增 @PDF 缺口处理形成正式 GUI 死路。** 引用 PDF 第一次准备保存 failed/coverage-gap，用户选择仅文本后 Store 仍为 failed；原 GUI 对所有非 ready 项禁发，而 reference retry 不改变状态。现 GUI 允许引用重新发起发送准备，Main 每次仍授权重读并重新转换。正式控件回归断言 failed @PDF 在显式文本选择后 `onBlocked(false)`，保留原子引用与缺口说明；Store 回归确认页数/转换/授权失败不被文本选择绕过，旧派生内容不用于后续新文件版本的发送。
4. **P2：队列图片变更前来源在持久化时遗漏。** 主 Agent 在实际包内验证发现，RuntimeService 已传 `previousImages`，但 `QueueChangeRepository.prepare` 显式构建落盘记录时未复制该字段。实际图片与原冻结提交没有丢失，缺失的是带图编辑/删除/移动的变更前图片来源，且同一 trace 的身份核对没有包含该来源。这是本审查第一轮未发现的遗漏。实现方先补真正失败测试，再持久化有界 `previousImages` 并纳入 `isDeepStrictEqual` 身份核对；独立补充复核确认记录可读取、不同图片身份重用 trace 被原子拒绝、dispatching 恢复 unknown 保留元信息，不引入图片二进制副本或重放原生操作。
5. **P2：合法大附件的 Base64 正则校验栈溢出。** 主 Agent 在真实 Main 输入边界发现，整串重复组正则对合法大 Base64 输入抛 `RangeError`，预算内原件无法私有复制。真实 6,000,000 字节文本用例先失败后修复。现使用 Buffer 解码后重新规范编码并与输入全串严格等值，保留严格校验；非法字符、空白和非规范编码不能借 Node 宽松解码通过。独立复核 Main 行为回归及跨 preload 预览全部通过，原件 ready/私有复制与实际编码超限拒发相互独立。
6. **P2：独立预览/准备操作可悄悄清除先前失败的导入请求。** 初始 `AttachmentControls.run` 开头无条件 `setFailed(null)`，catch 与 unavailable 也无条件覆盖单个 failed 状态。实际触发为已有附件、文件选择返回 `source-too-large` 并禁发，随后用户预览已有附件；成功预览后原失败请求与警示消失，发送解除阻止，用户没有明确移除或重试该失败请求。无关操作失败同样可能覆盖它。实现方以正式控件 6 种成功/失败组合补真实红灯，现将阻止发送的导入/新增引用失败与普通操作反馈分开；预览、已有附件重试/文本选择均不能清除或覆盖原请求。仅相同失败请求的显式重试成功或用户明确移除才解除阻止，重试取消仍保留；重试保留原 @ 替换范围，并阻止新导入替换未解决来源。独立复核源码及 6 种组合、显式重试成功/取消回归全绿。此项源于可达源码路径与正式 GUI 自动化，未冒称 macOS 复现。

审查还指出 @PDF 原先未走转换、Dockerfile/Makefile/README/dotfile 等常见项目文本未被识别。实现方补齐发送时 PDF 转换与已知文本名称准入；源文件与表示仍有明确预算，未知二进制、非法编码继续拒绝。相关 Store 用例已通过。

## 接口与所有权复核

- 私有原件按摘要存储，引用具有独立身份/Thread 归属，文件和目录权限受限；损坏/缺失不冒充 ready payload。引用通过既有项目根规范化、symlink 与文件句柄复核读取；准备后再次核实目录、执行授权与目标身份。
- 冻结 content 与原文一并落入 prepared 收据。Main 与 Host 使用相同实际 message/images frame；编码后的帧预算再次检查，实际图像准入使用固定 SDK `sendsImageInputOnWire`，Host 在 native write 前复核。
- `dispatching` 持久化先于写入；重发复用原冻结 content，unknown 路径未自动重放。prepared 冷恢复与目录/连接边界仍沿用现有准入，未创建替代旧执行会话。
- 原生队列保留 OMP 所有权，App 只发送编辑意图与有界元信息。保存保留选中图片原生对象及 content 顺序，外国/重复图片身份原子拒绝；claim 与编辑等待遵循原生批次行为，取消不丢图片。原提交 content 不被队列修改覆写。
- 未持久化的 FileReader/失败文件来源会阻止关窗，成功复制后允许关窗；失败来源由用户重试或移除。正式输入使用 controller 所有的导入模型，晚到结果不插入其他 Thread；@ 范围与选区变化复核，纯文本粘贴模式保留。

## 独立验证

最终于 2026-10-02 22:16（Asia/Shanghai）复跑：

- 13 个 Vitest 文件 **116/116 通过**：AttachmentStore、Main attachment-service、正式 AttachmentControls/Composer/QueueControls、AttachmentImports、AppModel 关窗、submission-content、SubmissionCoordinator、RuntimeService、prepared recovery、SessionHost、项目文件读取。
- 另 2 个 integration 文件 **2/2 通过**：attachment-preview（跨 preload/service）与 attachment-migration。
- `node scripts/testing/test.mjs node tests/tooling/native-queue.test.mjs` **13/13 通过**。

主 Agent 随后发现第 4 项并修复，审查者于 22:23（Asia/Shanghai）补充复跑 4 个文件 **43/43 通过**：QueueChangeRepository 10 项（包含新增来源持久化/冲突/unknown 回归）、queue-change-recovery 1 项、queue-storage 2 项、native-queue-configuration 30 项。新增两文件源码及 Main DTO/变更合同/恢复路径已重新核对；当前无待修 P1/P2。该检查不复用或冒称之前候选的包内通过，最终重建 macOS 候选验收由主 Agent 负责。

22:33 追加 GUI/styles 审查：dialog 使用共享间距/尺寸及 `--overlay`，原生 `showModal/close`、标题 aria 命名与关闭按钮 autofocus 正确接入，图片内容独立滚动、64 KiB 文本截片提示保留；现有 3 文件 **15/15 通过**（正式 AttachmentControls 6、真实 splitBlock/前置 atom 的 @ 边界 2、Composer 7）。两个 @ 边界用例验证既有正确行为，未修改其生产逻辑或伪造红灯。该组通过不覆盖第 6 项组合，故不能作为其排除证据。

22:35 复核第 5 项：Main attachment-service **2/2**、attachment-preview 跨 preload **1/1** 通过，新增源码与严格 roundtrip 校验已核对。此时仅第 6 项仍待修复；macOS 最终视觉/焦点结果由主 Agent 验收。

22:37 第 6 项修后最终定向复核 5 文件 **26/26 通过**：正式 AttachmentControls 14、真实 splitBlock/atom @ 边界 2、Composer 7、Main attachment-service 2、跨 preload 预览 1。确认失败来源保留与 typed 原因、模态语义/关闭按钮焦点入口、严格大 Base64 准入没有回退；此次只扩大到受改动直接影响的组合，未重跑无关全量矩阵。当前第 5/6 项均已修复且无待修 P1/P2。

首次扩展复核时 RuntimeService 测试有 4 个测试接口错误，实现在编辑过程中误将 `SubmissionRepository.list` 替换为不存在的 `receipts`；主 Agent 已纠正，定稿后上述重跑全绿。该红灯属于测试代码错误，不当作产品缺陷证据，也不宣称为产品 TDD 红灯。

审查者未运行或干扰 SDK 资源准备、GUI 或真实 Provider。固定 SDK localhost 队列证据来自实现方的 [队列记录](queue-content.md)，审查仅核对其源码与记录，未独立复跑网络样本；隔离 macOS 候选及全量工程检查由主 Agent 记录。

## 保留范围

完整 04/05 与 M2 用户认可尚未完成。当前 PDF 仅有显式文本转换，视觉/OCR 覆盖缺口不判通过；图片编辑、完整子 Agent 生命周期等仍由所属任务维护。B4 引用计数释放、延迟 7 天 GC 与完整一致性扫描尚未接入；当前保守保留原件，容量不足明确拒绝新增，不能据此称完整附件生命周期完成。冷旧 Thread 继续只读，退出放弃队列待决仍保留。
