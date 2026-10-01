# input 模块

- 草稿正文、版本、引用序列化和编辑器资源归 input；提交收据与 OMP 消费不归 input。
- `contracts/public.ts` 与 `core/public.ts` 是无头消费者的公开面；Renderer 组合通过窄入口使用编辑器能力。
- 不在这里复制执行队列、OMP 历史或第二份可写正文；恢复/提交事务继续由既有 Main/存储所有者负责。
- 依据 `docs/architecture/modules/input-context.md` 和基础契约保留 revision、冻结内容及冲突语义。
- 编辑连续性由窗口所有的 `DraftEditorCache` 暂存脱离 View 的 EditorState；仅同 revision/消费序号/正文可恢复。缓存上限 8 个 Thread、4 MiB UTF-8 正文，撤销深度 50；超限或窗口释放不影响 Main 持久草稿。旧视图事件必须保持原 Thread 绑定。
