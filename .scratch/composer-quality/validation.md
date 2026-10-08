# Composer 验证记录

基点 `a9cf9a9d`。以下较早记录固定于 `3b932e04`，动态引用预览 `36121ea`；共享 thumbnail 样式 `ac6330a4`。该版 UI 已被用户拒绝，不能作为当前 UI 通过证据。最新纠正记录在本文末尾。Node 24.21.0、pnpm 12.8.1、Electron 44.4.5、SDK 18.4.6、macOS arm64。测试边界与原生观测分别列示。

## 自动化

| 检查 | 实际结果与证据 |
| --- | --- |
| 本轮较早的 `pnpm check` | 类型、Biome、design/i18n、设计负例、source boundaries、architecture/documentation/structure/status、35 architecture tests、108 tooling tests 通过；Vitest 1181 passed / 2 skipped / 1 failed，见[完整输出](evidence/check-full.txt) |
| `pnpm check:fast` | 最终交接文档及生成报告后全部通过，见[输出](evidence/check-fast.txt) |
| 最后 main / renderer 类型 | `pnpm typecheck:main`、`pnpm typecheck:renderer` 通过 |
| `pnpm build` | 成功，保留 Zod 注释和 chunk size 警告，见[输出](evidence/build.txt)；非打包/签名证据 |
| 映射原位置与资源 | 真实 PM 25 + Main import operations 6 通过，见[输出](evidence/origin-main-green.txt) |
| 最后导航 fence | 2文件5测试通过，见[输出](evidence/ipc-green.txt) |
| PDF GUI | 原job确为 pdf-coverage-gap 后，缺确认按钮失败→同ID预览/确认/显式插入成功，真实 Composer 22通过；[red](evidence/pdf-ui-red.txt) / [green](evidence/pdf-ui-green.txt) |
| 显式插入焦点 | 按钮先获焦，采用后正文有token但焦点body失败→成功回editor；真实 Composer+PM 47通过；[red](evidence/explicit-focus-red.txt) / [green](evidence/explicit-focus-green.txt) |
| 动态项目预览 | 新10项包含真实文件/目录、越界symlink、Thread失效、25MiB拒绝、64KiB UTF-8截断及不冻结资产；主树相关5文件38通过，见[输出](evidence/reference-preview-green.txt)。[red](evidence/reference-preview-red.txt)/[worker green](evidence/reference-preview-worker-green.txt)为独立snapshot证据复跑，非未保存的首次stdout，见[说明](evidence/reference-preview-replay.txt) |
| 原生 dialog 关闭 | 按钮/cancel原先在节点断开后才close，两项红→同步释放modal后正文focus；Controls/Composer/reference 3文件47通过，见[red](evidence/modal-focus-red.txt)/[green](evidence/modal-focus-green.txt) |
| UI detector | 指定变更UI未发现问题；首次多出错误 styles.css 路径，已对实际 shared button.css 单独补查；[结果](evidence/impeccable.json)。未关闭design lint |

全量日志对应较早组合阶段，后续修复按风险运行受影响回归与类型/build/fast门禁，未把该全量数字冒称最后固定源码的全量重跑。完整检查最后失败的唯一 Vitest 为 `tests/integration/configuration-sharing.integration.test.ts`：`validation/m2/configuration-sharing.mjs:355` 请求 SDK `dist/cli.js`，`scripts/runtime/sdk-packaging.mjs:72` 对18.4.6明确将其作为 cli-bundle 剔除；这两文件相对本切片基点未改动。没有复制假CLI或改fixture掩盖失败。

环境工具检查使用声明版本。Corepack 在隔离目录默认尝试未缓存版本，且 tooling 的“缺少 pnpm”负例会把 Node 同目录 shim 当作可用工具；本轮以临时独立目录的相同 Node 二进制、固定 pnpm12.8.1 wrapper 执行检查，不改仓库或系统配置。对应日志报告 exact dependencies 48/48；fast tools-only 跳过 native inspection，不据此宣称完整环境检测通过。

## 原生 Dev

`pnpm dev` 从新工作树启动。较早整段交互验收 Main 身份为 `28bacd6c-6e743975`，process `c098c151-0ab9-4ccc-8bca-02aa590ba828`；之后仅共享 thumbnail CSS 热更新至 `ac6330a4`，没有行为模块再加载。Thread A `7ba9898c-1046-452f-86b7-87c868a40d0e`，B `20fd4c35-2a2e-4f13-b4de-b818fa475dce`，目录 `/private/tmp/dpi-composer-native`。只保存这两个fixture的附件阶段日志，见[native events](evidence/native-events.jsonl)。已有截图在本会话 CUA 工具结果中直接显示，未伪造导出文件。

- @src/ → Down → Enter →立即输入B：候选beta.ts被采用，B保留。Escape后同token追加字母不重开；新token重开。Tab从popup正常到模型按钮。
- 中文“原生验收 A”普通粘贴、保存后重启恢复成功。Ctrl+Space/逐键尝试只得到Latin nihao，没有观察到输入法marked-text，故真实IME未验证。自动化覆盖view.composing、event.isComposing、229及repeat/popup/send优先级。
- 无效pixel.png显示明确invalid-image；移除仅移除该chip、正文保留。有效sample.png通过原生选择器导入，AX与画面可见缩略图；真实预览含图像与缩放控件。
- 关闭预览→直接Cmd+Z：图片消失，中文正文完整；Cmd+Shift+Z恢复。创建B草稿后回A，图片/正文恢复，B未串入A。history-open/update均有Main完成ACK。
- light/dark画面核对popup靠近caret、候选高亮与实际thumb。发现pill继承后仅修sharedsize，最终圆角矩形视觉确认。未做无关持续打磨。

最终 `3b932e04` 重新启动 Dev（源码已提交，dirty仅交接文档/生成报告），Main身份 `3b932e04-dirty-5236577f`，process `bd34346c-2905-4ffb-91bd-99a3bf900d5f`。动态beta.ts显示 `export const beta = 2;`，src目录显示alpha.ts/beta.ts直接条目；目录关闭按钮与Escape、文件Escape均由AX确认焦点回正文、内容保留。此前36121ea原生目录关闭焦点落HTML，被3b932e04修复并重验。[最后fixture阶段日志](evidence/native-preview-events.jsonl)只证明Main阶段/身份，内容与焦点来自本会话CUA结果。最终新增截图请求因ScreenCaptureKit -3811失败，未把AX文本冒称截图。

早期边实现边热重载出现history-open/update reference-denied；当时不能归因为单一导航事件。固定代码重新启动后租约成功，没有复现。保留真实失败与证据差异，不把单位测试的导航fence当作该运行时失败的确定根因。

未运行：真实CJK组合态/VoiceOver/200%缩放/窄窗/30min性能、OS文件mixed paste/drop竞态全集、实机PDF确认、个人账户/provider请求、真实Host queue发送、打包/签名/远端CI。工程验证不等于用户认可。

## 2026-10-08 UI 拒绝后的纠正

纠正范围 `72863d9..fee53ddf`。Toolbar 独立 worker `b8dbdf6` 串行集成为 `01ea0d6`；连续编辑表面、附件分区、内联引用和组件绑定在 `baf46f0`；原生/评审发现的焦点、展开布局、连续隐藏外部锚点键盘导航在 `f37b47f7`；共享弹层/文件chip圆角在 `fee53ddf`。没有改写 M2 导入权威、Main 资源合同或发送队列。

| 检查 | 当前实际结果与证据 |
| --- | --- |
| 纯 Toolbar / ActionMenu | 7 项通过，另有 3 项合同缺口先红；[red](evidence/ui-correction/toolbar-red.txt) / [green](evidence/ui-correction/toolbar-green.txt) |
| 项目引用呈现 / external rail | 先失败再实现；[red](evidence/ui-correction/presentation-red.txt) 中 frozen fixture 初次缺 inputDigest 的失败属于测试准备错误，已纠正，不能计作产品缺陷 |
| 评审边界 | expanded 快捷键文案、展开后输入焦点、双向连续隐藏 external anchors 共4项红；[red](evidence/ui-correction/review-red.txt) |
| 附件管理关闭映射焦点 | 打开后中间编辑导致 bookmark 应从2映射到3，原实现仍2，真实 PM 红；[red](evidence/ui-correction/manager-focus-red.txt) |
| 纠正后 Composer / Controls / 引用 / Toolbar | 12 文件 82 项通过，含原位置、Undo/Redo、partial/PDF、history lease；[green](evidence/ui-correction/composer-green.txt) |
| 保留 input / Main / frozen clipboard | 15 文件 105 项通过，真实附件生命周期与冻结引用覆盖；[输出](evidence/ui-correction/retained-boundaries.txt)。与前一行有重叠，不合计作独立总数 |
| 共享 popup 组件 | 最后增量6文件18项通过；[输出](evidence/ui-correction/popup-components.txt) |
| 类型、fast、design、interaction、i18n | 全部通过；[类型](evidence/ui-correction/typecheck.txt)、[fast](evidence/ui-correction/check-fast.txt)、[design](evidence/ui-correction/design.txt)、[interaction](evidence/ui-correction/interaction.txt)、[i18n](evidence/ui-correction/i18n.txt) |
| Build | 完成，现有大 chunk 警告保留；[输出](evidence/ui-correction/build.txt) |

部分 React async fixture 有既存 act 警告，保留 stdout。没有重新宣称完整 pnpm check 全绿；较早 CLI fixture 与 SDK 打包规则冲突的失败仍保留。

当前 Dev 从上述 worktree 的干净源码 `fee53ddf` 启动，Main build `fee53ddf-ef3241b6`，process `584a0f7a-a525-4c95-9e46-ee2f2795f999`；[启动输出](evidence/ui-correction/dev.txt)。原工作树检查仍干净。只操作同一隔离 fixture Thread B，不授予项目执行权限、不发送 provider 请求。

实际 UI 与焦点证据来自本会话 CUA，不是 DOM fixture：外部 sample.png 缩略图和 note.txt 文件分别呈现，alpha.ts 只内联；正文、附件和底栏共享连续表面，三个默认技术展开入口已移走；@src/ 候选有类型/文件名/路径，Enter 确认后能继续输入中文；展开后正文继续输入且底栏位于编辑表面底部；附件管理关闭后直接粘贴“弹窗关闭后输入”，AX 正文确有新增文字，焦点为消息输入。

原生截图曾出现同一次操作后与 AX 状态不一致，另有 ScreenCaptureKit -3811；不能用该单帧宣布菜单/弹窗遮挡已解决或制造截图文件。当时共享 popup 计算 z-index 经 DevTools 原生只读检查为50，状态为data-open，仍需独立视觉复核；随后复核结果见下一段。截图只在工具输出展示，未虚构可导出路径。

独立 fresh finish reviewer 随后重新获取了无遮挡画面，并实际操作收起/展开/More：菜单可见，默认三个技术Disclosure不存在；实际截图坐标点击展开仅保留caret、没有outline，结论 ship，范围限浅色宽窗。root随后验证深色宽窗及DevTools停靠后的565×780内容视口，正文换行、底栏/More菜单无横向溢出，恢复浅色收起态。长文件名样本通过原生选择器导入，文件chip截断后保留大小与删除按钮。此处补足视觉证据，不把最早不一致帧当作当前确定缺陷。

最后原生选择器返回焦点暴露旧入口问题，`7827d38` 在打开picker前保留当前caret作为系统返回目标；独立成功晚到反例再发现旧adapter仍无条件focus。`836f591` 在临时insertion队列保留焦点意图：自动choose-import采用不聚焦，用户显式待插入/项目选择保持聚焦；没有修改IPC、持久化或M2mapped target。正式取消/成功两条真实PM/React反例先红再绿，17文件125项通过，完整typecheck/check:fast与build通过。初次picker测试忘记挂载editor，已修正fixture后重跑基线红，归档red来自修正后的fixture，不将准备错误作产品证据。

Standards随后发现source-too-large的“重试准备”仍直接打开picker，绕过首次入口；两条重试取消/成功反例红，`3918b64`复用同一prepareNativePicker守卫后转绿。没有把管理Modal内其他command的重新导入机械聚焦到inert editor。

| 最后焦点回归与检查 | 实际证据 |
| --- | --- |
| 首次picker / 自动完成 / 失败重试 | [首次red](evidence/ui-correction/picker-focus-red.txt)、[晚到red](evidence/ui-correction/picker-success-red.txt)、[重试red](evidence/ui-correction/picker-retry-red.txt)；最终17文件127项通过，[green](evidence/ui-correction/picker-final-green.txt) |
| 类型 | 836f591完整[main/renderer](evidence/ui-correction/picker-typecheck.txt)通过；3918b64只改Renderer入口，最后[renderer](evidence/ui-correction/picker-final-renderer-types.txt)通过 |
| fast / build | 836f591 [fast](evidence/ui-correction/picker-check-fast.txt)通过；3918b64 [build](evidence/ui-correction/picker-build.txt)成功，现有chunk警告保留。最终交接文档/报告后的fast见[输出](evidence/ui-correction/final-check-fast.txt) |
| 最后原生 | 3918b64固定源码启动，dirty仅交接文档；[启动](evidence/ui-correction/picker-dev.txt)、[fixture阶段事件](evidence/ui-correction/native-events.jsonl)、[原生操作记录](evidence/ui-correction/native-ui.md) |

最后Dev Main build `3918b64a-dirty-2eee4843`，process `33bb81f0-36f4-4e00-806c-53fc29aac675`。26MiB样本在原生picker后显示“原件超出25 MiB限制”；重试→取消→无需点正文直接粘贴“重试取消后继续输入”，失败仍保留、正文更新、AX焦点为消息；再次重试→选择40字节有效文本→错误消失/新文件chip出现→直接粘贴“导入成功后继续输入”，仍进正文且焦点保持。最后真实坐标点击正文仅caret，没有outline。系统GoTo键盘后的focus-visible outline是键盘状态，不冒称为鼠标缺陷。Main阶段事件仅证明构建/请求/资源ACK，视觉与焦点来自CUA。

本轮剩余矩阵：真实输入法marked-text、VoiceOver、OS所有尺寸/200%缩放、30min性能、mixed paste/drop竞态全集、实机PDF/其余错误组合、provider/Host queue。565px仅实际停靠内容视口。源码工程完成、可试用，用户认可pending。

## 2026-10-08 图片独立、文件内联与去重

本轮源码 `e0c43e507554ee09268eef3fa050b906f698d8af`，反馈增量 `dd8d812..e0c43e5`。用户明确自行实机测试；本轮未启动Dev/GUI/E2E，先前原生截图和IME限制不能作为当前布局通过证据。原Dev进程已停止。

| 验证 | 实际结果与原始证据 |
| --- | --- |
| 图片与编辑历史、可信粘贴、采用去重 | 修正baseline fixture后3项实际red；duplicate settlement及image cleanup ACK另2项red；[图片red](evidence/attachment-semantics/images-red.txt)、[结算red](evidence/attachment-semantics/settlement-red.txt) |
| MIME呈现与fallback边界 | worker2项呈现red、原型key1项red，3文件50项worker green；不与root集合相加。[red](evidence/attachment-semantics/mime-red.txt)、[边界red](evidence/attachment-semantics/mime-hardening-red.txt)、[worker green](evidence/attachment-semantics/mime-worker-green.txt) |
| 独立评审反例 | fec2290归档10失败/33通过；1b50c88归档新增真实Main/SQLite、空行和readonly分类6失败/52跳过；label-only又1项red，最后Thread门禁1项red。[评审red](evidence/attachment-semantics/review-red.txt)、[Main red](evidence/attachment-semantics/real-main-red.txt)、[label red](evidence/attachment-semantics/label-projection-red.txt)、[Thread red](evidence/attachment-semantics/thread-readiness-red.txt) |
| 最终受影响回归 | **50文件369项通过**：input全模块、workbench、renderer wiring、Main history/clipboard、真实SQLite生命周期、legacy mixed clipboard。[green](evidence/attachment-semantics/green.txt) |
| 类型与门禁 | 完整typecheck、Biome/fast、design/i18n/interaction、architecture/生成报告通过。[类型](evidence/attachment-semantics/typecheck.txt)、[fast](evidence/attachment-semantics/check-fast.txt)、[design](evidence/attachment-semantics/design.txt)、[i18n](evidence/attachment-semantics/i18n.txt)、[interaction](evidence/attachment-semantics/interaction.txt) |
| Build | 成功，现有大chunk警告保留；非打包/签名证明。[输出](evidence/attachment-semantics/build.txt) |
| 扩展真实SDK PDF集合 | 既有PDF冻结复制失败，其余13项通过；legacy mixed clipboard另1项通过。未改1b50c88固定snapshot同样PDF失败，根因unknown。[当前扩展输出](evidence/attachment-semantics/extended-clipboard.txt)、[基线输出](evidence/attachment-semantics/previous-sdk-pdf-failure.txt) |
| UI源码检查 | MIME/inline指定文件detector为[]，[结果](evidence/attachment-semantics/impeccable.json)。不是视觉或原生证据 |

红灯出处与fixture修正区别见[来源记录](evidence/attachment-semantics/provenance.md)。原stdout/stderr完整保留，包括React act和工具warning。最后只改Thread readiness后扩展wiring矩阵；没有机械重复全部原生或完整check。先前configuration-sharing CLI fixture失败仍在记录，完整check不宣称全绿。

当前UI：图片独立缩略图且不入Undo，其他文件MIME内联并入Undo，项目引用不进外部栏；默认重复的大块错误移入详情。DOCX/视频等仍没有Main内容转换支持，MIME样式不会伪装ready。未知附件分类前保护冷草稿，读取失败可重新加载；分类/标签不写脏草稿，真实Main只退出图片历史并保留文件旧摘要，共享对象保护和ACK失败重试经联合测试。冻结source只有普通paragraph附件有权威，Main准备/保存/扫描和Renderer readiness一致。

本轮用户验收pending；真实IME、焦点/样式、OS drag/drop/clipboard竞态、窄窗/主题/缩放、VoiceOver、长会话和provider/Host queue没有新实机结果。

## 2026-10-08 日常状态与导入呈现（06）

固定 base 2fdeab2 → source 6b39d19。首先用真实 Composer、DraftController、AttachmentImports 和共享焦点入口反例得到6失败/32通过：dirty状态仍占位、成功报告长驻、移除后结算失败仍声称已插入及保留预览、input/textarea/contenteditable输入键清除指针来源。修复后38通过。后续补真实saving/checking→恢复和file Undo/Redo跨未完成结算；完整本轮 input/workbench/focus/Thread 装配回归39文件302项通过，不与旧50文件369项累加。

全typecheck、check:fast、lint:design、lint:i18n、build通过，structure报告按源码新鲜度重生，架构依赖边未变；impeccable指定UI检测[]。第一次扩展测试的两个失败来自旧待保存可见断言与取消按钮全文定位，按当前明确UI合同改成pending安静和完整aria-label；首次typecheck抓到image preview测试fixture多余mimeType已移除。错误准备不计为产品红灯。

未运行validate:interaction（启动Electron）、Dev/GUI/E2E、真实provider/Host；深浅主题、窄窗、原生IME/OS/辅助技术及实际视觉由用户自测。完整check未重跑，既有SDKPDF/CLIfixture失败保留。原始证据见[provenance](evidence/quiet-composer/provenance.md)。
