# input 模块

- 草稿正文、版本、引用序列化和编辑器资源归 input；提交收据与 OMP 消费不归 input。
- `contracts/public.ts` 与 `core/public.ts` 是无头消费者的公开面；Renderer 组合通过窄入口使用编辑器能力。
- 不在这里复制执行队列、OMP 历史或第二份可写正文；恢复/提交事务继续由既有 Main/存储所有者负责。
- 依据 `docs/architecture/modules/input-context.md` 和基础契约保留 revision、冻结内容及冲突语义。
- 编辑连续性由窗口所有的 `DraftEditorCache` 暂存脱离 View 的 EditorState；仅同 revision/消费序号/正文可恢复。缓存上限 8 个 Thread、4 MiB UTF-8 正文，撤销深度 50；超限或窗口释放不影响 Main 持久草稿。旧视图事件必须保持原 Thread 绑定。

## 内部落点

Renderer 按 `editor/`（编辑器与窗口缓存）、`clipboard/`（纯文本/结构粘贴）、`references/`（引用节点与选区插入）分组。core 的消费行为测试以 `draft-consumption.test.ts` 命名，避免误归提交模块。测试与实现就近，跨模块仍只用环境 `public.ts`。

附件协调规则在 `core/attachments/attachment-model.ts`，浏览器 File/FileReader 接入在 `renderer/attachments/`，编辑交易在 `renderer/references/attachment-editor.ts`。Thread 应用作用域创建模型；组件只绑定/订阅，不再用组件 useState 或 WeakMap 拥有附件请求失败。

编辑 epoch 的依赖超集由 core/attachments/editor-history-model.ts 管理，Renderer 缓存只从公开事务 before/doc 观察 ID；Main 验证 manifest 后建立有界租约。持久化前等待租约确认，失败保留正文/撤销并显式重试，达限明确提示并清历史。所有历史结束/缓存淘汰/窗口结束都释放租约，GC 的 transient epoch 要在实际 unlink 前复核。

同 ID 重试/引用准备产生新摘要时，Main manifest 发布同步刷新全部对应历史租约；预算超限不部分发布/补 pin，保留原 manifest 和 Undo，用准确失败原因请求显式清史恢复。Renderer ID 去重不是资产版本稳定性的证明。
