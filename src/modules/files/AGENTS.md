# files 模块

- `contracts/public.ts` 是跨环境文件请求、回复与桥接合同的公开面。
- `core/public.ts` 是选区、代码视图和版本化来源的无平台规则公开面。
- `main/public.ts` 提供授权的只读项目文件读取；不要在模块内修改工作区或 Git index。
- `renderer/public.ts` 提供只读 Monaco 视图；编辑器/worker 的释放归 Renderer 实现。
- 文件内容、真实路径、symlink/FIFO 拒绝、大小/编码/并发变化语义保持与 `docs/architecture/modules/files-editor.md` 一致。

Renderer 的 `queries.ts` 管只读查询，`editor/` 管 Monaco 加载、模型/视图及 Diff 选项；公开面仍是 `renderer/public.ts`。不将查询缓存或 editor 资源移入 app owner。
