# Composer M1/M2 本地交接

2026-10-08。分支 `codex/composer-quality`，工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`；基点 `a9cf9a9d`，行为源码固定于 `3b932e04`（含 `36121ea` 动态引用预览与原生dialog关闭顺序修复）。原 `/Users/lou/Learn/d-pi` 未保留本任务改动，原提交与证据保留。所有代码已本地提交，未 push、创建远端 PR 或发布。

## 可以试用

在上述工作树使用项目声明的 Node 24.21.0 / pnpm 12.8.1 执行 `pnpm dev`。日常 Dev 数据目录由 checkout 派生，本轮实际为 `/Users/lou/.d-pi/dev/d-pi-ee0db27baf1b`。App 数据隔离不等于 OMP 配置/认证隔离。本轮仅操作 `/tmp/dpi-composer-native` 的隔离样本，未授予项目执行权限或发送 provider 请求。

M1：光标附近 @ 补全、稳定候选/Enter 单次确认、Escape 同 token 关闭、Tab 正常导航、IME 三路守护；原子引用方向键/选区/详情关闭恢复；动态项目文件/目录复用受控只读预览，不冻结来源；图片缩略图与文件 chip、附件失败反馈、模型与附件 footer。布局以用户截图为参考，沿共享 token、Button 与 focus-visible 规则。

M2：外部文本先插入，文件按同批稳定顺序、映射原位置一次独立 Undo 采用；随后输入和无关 Undo 不抹掉原意图，删除/撤销原来源则永久失效。失效/跨 Thread 晚到保留原 Thread 待插入；部分失败明确采用成功项；PDF 可预览、同 ID 确认仅文本后显式插入。读取/准备有界，逐阶段取消、retry 与 settlement 分开；freeze/dispose/晚到不产生幽灵插入。显式插入成功回到 editor，自动完成不抢焦点。

原 Draft/EditorState cache、Main history leases、可信 clipboard、冻结发送与原生 queue 继续复用。新增 Main import settlement 只移交 import pin；没有第二份正文、自动重发或新的执行队列。

## 证据和未完成项

见 [验证](validation.md) 与 [独立评审](review.md)。较早全量检查1181个组合测试通过，2 skipped，1 未改动的配置共享 CLI fixture 失败；完整 `pnpm check` 因此不是全绿。类型、格式、设计/交互/国际化、架构/文档/报告、35 个架构测试、108 个 tooling 测试及 build 已通过。后续最终增量预览相关38、原生modal关闭/Composer/reference 47、IPC5等受影响回归通过，未把早期全量数字当作最终源码全量重跑。

Dev 已实际验证中文文本粘贴、补全后继续输入、Escape、Tab、有效/无效图片、预览关闭焦点、Undo/Redo、两个 Thread 的草稿/图片恢复及 light/dark。实际 Main 日志身份与历史 lease ACK 见 [native events](evidence/native-events.jsonl)。最后成功截图检查发现thumbnail继承pill，已在shared size用既有圆角token修正并视觉确认。最后Dev另通过AX验证动态文件/目录内容，以及按钮/Escape关闭后正文焦点；新增截图采集失败，准确记录在验证页。Dev仍运行供试用。

仍待验证：真实 CJK 输入法的 marked-text/候选确认（普通中文粘贴不是 IME 证据）、VoiceOver、窄窗/200% 缩放、30 分钟长会话性能、原生 OS 文件 paste/drop 的完整竞态与真实 PDF 确认对话框。M2 这些竞态已用真实 PM、真实 Main/文件/SQLite及真实 React Composer fixture 覆盖，但不冒称 OS/provider/Host queue 的实机验证。现有原生 queue 未新增、未在本轮重新发送验收。

另需单独处理既有 `configuration-sharing` fixture 对已被 SDK 打包规则剔除的 `dist/cli.js` 的依赖。M3 Markdown/图片压缩、历史召回、M4 slash/skills/providers 未纳入授权切片。本轮无重大产品待决；工程完成、试用已交付，用户认可仍 pending。
