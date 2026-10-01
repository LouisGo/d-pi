# 05 窗口内跨 Thread 编辑连续性

Status: resolved
Blocked by: none

范围/授权见 [spec](../spec.md)；这是已认可的产品改善，不声称既有跨 Thread undo 合同已违规。关联 D-10/D-29/D-33/D-37 和 [M2 04](../../m2-first-release/issues/04-input-attachments.md)。

## 目标与设计

同窗口 A→B→A 恢复 A 的选区和有限撤销，B 独立；保持保存草稿、迟到 IME 绑定、发送消费不复活原文。采用 [design](../design.md)的 Thread 编辑状态缓存，最多 8 个 Thread/估算正文 4 MiB/每 Thread 50 history event 深度初值、LRU，EditorView/DOM 切换释放，业务草稿不随 eviction 删除；正文估算不冒称 undo 内存硬上限。

不把 ProseMirror JSON/undo 写 SQLite，不承诺 reload/重启跨进程恢复撤销，不为每 Thread 保留隐藏 DOM。语言/主题/密度更新不重建 editor，原有正确行为继续。

## 验收

真实 Tiptap/ProseMirror：段中选区、两次修改、切 B 编辑、回 A、undo/redo 后内容与位置正确；迟到 IME 不写 B；发送消费/新的草稿版本使旧 undo 失效；LRU eviction 后正文保留、恢复无旧历史；窗口 reload 只恢复持久草稿。必要 GUI 补焦点/输入法证据，不只比较字符串或 mock editor。

本票无 SDK 前置，可以独立并行交付，不阻塞 01–04；完整切片的 06 集成验收包含本票。

## Comments

2026-10-01：待整体方案审阅时明确纳入或延期，未实施。

2026-10-01（方案认可后）：用户认可完整方案，本票纳入新会话实施范围；尚未领取或实施。

2026-10-01（实施）：窗口级 `DraftEditorCache` 由 AppModel 创建/释放，input Renderer 保存去掉 Tiptap/view/URL-decoration 插件的纯 EditorState。共享 schema 不带 Editor 上下文，避免 inactive state 经 schema callback 保留已释放 view；恢复重新安装当前 Editor 的插件。草稿保存仍由 DraftController 协调，新增只读 revision/sequence/text 快照用于恢复匹配，不新增数据库字段。默认 8 个 Thread、UTF-8 正文估算 4 MiB，LRU 淘汰/超大稿只释放编辑历史；UndoRedo 配置 depth 50，沿用 ProseMirror 原生批次裁剪（最多允许 20 个 event 的短暂 overflow），不把正文估算或 depth 冒称 RSS 硬上限。

发送消费和显式加载外部正文清空 undo/redo；恢复草稿版本或正文变化时旧缓存失效。AppModel 返回一个已有 Thread 时核对已保存 controller 与 Main 的 revision/body，不再忽略外部新草稿。迟到 update 固定到原 controller，且新一代相同 Thread Editor 挂载后拒绝旧 Editor 写入；旧 destroy 回调也不能覆盖新缓存。切换继续释放 EditorView/DOM，主题/密度/语言和展开更新沿用已有 Editor。

**红绿证据**：`composer-continuity.test.ts` 的三个真实 React/Tiptap 场景在修改前均失败：A 回来选区由 3/9 丢为 1、发送后 undo 返回 true 并能复活已提交稿、外部 revision 更新仍显示旧稿；实现后均通过。另在真实 Editor 缓存回归中先复现旧 A update 覆盖新 A 的失败，再加入 Editor lease 检查，重新通过。原 `m2-thread-switch` 的模拟存储补齐 save 后 revision/body 回读，使“保存后切换、返回复用 controller”仍测试真实保存合同。

**自动化结果**：`pnpm test src/modules/input src/app/renderer/workbench/composer-continuity.test.ts src/app/renderer/workbench/composer-binding.test.ts src/app/renderer/workbench/composer-initialization.test.ts src/app/renderer/model.test.ts src/app/renderer/m2-thread-switch.test.ts src/app/renderer/appearance-subscriptions.test.ts`，13 文件/60 tests 通过。包含真实 view 重建后两笔 undo/redo 与位置、Thread 隔离、LRU 第 9 个淘汰和 MRU 刷新、UTF-8 压力与超大稿正文保留、相同正文新 sequence/revision 清历史、旧 Editor 迟到 update/destroy、新窗口缓存只恢复正文；原 IME deferred consume、保存/消费、粘贴、引用、展开和外观更新回归继续通过。`pnpm exec tsc --noEmit`、`pnpm typecheck:renderer` 与涉及文件的 Biome 通过。

**集成/限制**：input Renderer 新增复用 shared 的 UTF-8 正文容量函数，需要机器清单登记；全局架构/生成结构与候选由 06 主 Agent 同批整合。以上 happy-dom 使用真实 Tiptap/ProseMirror，不证明 macOS 原生中文输入法、系统焦点或用户认可。必要原生焦点/IME 检查由 06 候选统一完成：段中选区切 B 再回 A、focus 后 ⌘Z/⇧⌘Z；真实候选组合期间切换继续拒绝，结束后允许切换。工程实现与自动化已完成，试用认可仍由 spec 管理。
