# Composer M1/M2 本地交接

2026-10-08。分支 `codex/composer-quality`，工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`；基点 `a9cf9a9d`，当前代码 `3918b64`，UI 纠正范围 `72863d9..3918b64`。旧 `3b932e04` 的资源/导入能力继续复用，但其 UI 被用户拒绝，不能作为体验通过证据。原 `/Users/lou/Learn/d-pi` 仍干净，原提交与证据保留。所有代码已本地提交，未 push、创建远端 PR 或发布。

## 可以试用

在上述工作树使用项目声明的 Node 24.21.0 / pnpm 12.8.1 执行 `pnpm dev`。日常 Dev 数据目录由 checkout 派生，本轮实际为 `/Users/lou/.d-pi/dev/d-pi-ee0db27baf1b`。App 数据隔离不等于 OMP 配置/认证隔离。本轮仅操作 `/tmp/dpi-composer-native` 的隔离样本，未授予项目执行权限或发送 provider 请求。

M1：光标附近 @ 补全、稳定候选/Enter 单次确认、Escape 同 token 关闭、Tab 正常导航、IME 三路守护；原子引用方向键/选区/详情关闭恢复；动态项目文件/目录复用受控只读预览，不冻结来源。

UI 已按截图重新组合：项目 @ 和复制的项目上下文仅正文内联，外部栏排除 live/frozen project reference；外部图片缩略图与紧凑文件 chip 分区，正文与附件共享连续表面。底部模型/真实项目权限在左，附件/展开/More/发送在右。默认的附件与存储、附件详情、输入选项不再占用输入区；维护移入按需 Modal，快捷键偏好进入 More，具体失败/覆盖缺口仍就近显示。通过共享 Base UI ActionMenu、Toolbar、AttachmentStrip/Attention、ReferenceSuggestions、AttachmentManager/Preview 组合；展示组件不拥有业务协调器或第二份提交状态，缩略图保留只读 Query。

结构参照 [T3 ChatComposer 固定源码](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/chat/ChatComposer.tsx) 的 Surface/Banner/Prompt/Toolbar 分工；未复制 T3 源码、状态、队列、权限或依赖，视觉值来自 d-pi 共享 token/Button/Icon Layer。

M2：外部文本先插入，文件按同批稳定顺序、映射原位置一次独立 Undo 采用；随后输入和无关 Undo 不抹掉原意图，删除/撤销原来源则永久失效。失效/跨 Thread 晚到保留原 Thread 待插入；部分失败明确采用成功项；PDF 可预览、同 ID 确认仅文本后显式插入。读取/准备有界，逐阶段取消、retry 与 settlement 分开；freeze/dispose/晚到不产生幽灵插入。显式插入成功回到 editor，自动完成不抢焦点。

原 Draft/EditorState cache、Main history leases、可信 clipboard、冻结发送与原生 queue 继续复用。新增 Main import settlement 只移交 import pin；没有第二份正文、自动重发或新的执行队列。

## 证据和未完成项

见 [验证](validation.md) 与 [独立评审](review.md)。本次 UI 纠正受影响12文件82项、保留 input/Main/clipboard 的15文件105项、共享弹层6文件18项通过，最后 Composer/input/picker 回归17文件127项通过；这些集合有重叠，不简单求和。类型、格式、design/interaction/i18n、架构/报告与 build 通过。较早完整 `pnpm check` 的1181 passed / 2 skipped / 1 未改动 CLI fixture 失败仍保留，不能称最终源码全量重跑或全绿。

固定 Dev 对照了浅色/深色宽窗和565px停靠视口：项目 alpha.ts 仅内联，外部 sample.png/note.txt/长文件名样本显示缩略图与紧凑 chip，长文件名截断后大小与删除动作保留；正文换行、底栏/More无横向溢出。展开后底栏位于底部、能继续输入；管理弹窗关闭后直接中文输入进入正文。最后代码3918b64的超限错误→重试取消→成功链已实机验证：取消保留错误和正文焦点，成功采用后清除错误且立即输入仍进入正文；实际鼠标点正文只有caret，无outline。独立 finish reviewer 对浅色宽窗收起/展开/More和实际鼠标焦点给出 ship，未据此宣称全部矩阵通过。较早两个 Thread/Undo/Redo证据继续留在验证页；不是本轮新布局的独立实机重跑。原生截图仅在本会话 CUA 展示，没有伪造导出文件。Dev 保留供试用。

仍待验证：真实 CJK 输入法的 marked-text/候选确认（普通中文粘贴不是 IME 证据）、VoiceOver、所有尺寸/200%缩放、30分钟长会话性能、原生OS文件 paste/drop 的完整竞态与真实PDF确认对话框；其余错误/部分失败组合没有逐项实机复跑。565px来自DevTools停靠后的实际内容视口，不是OS窗口尺寸全集。M2竞态已有真实PM、Main/文件/SQLite与React fixture覆盖，不冒称OS/provider/Host queue的实机验证。现有原生queue未新增、未重新发送验收。

另需单独处理既有 `configuration-sharing` fixture 对已被 SDK 打包规则剔除的 `dist/cli.js` 的依赖。M3 Markdown/图片压缩、历史召回、M4 slash/skills/providers 未纳入授权切片。本轮无重大产品待决；工程完成、试用已交付，用户认可仍 pending。
