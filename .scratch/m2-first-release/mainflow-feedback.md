# m2.8 主流程试用反馈与修复

2026-10-01。用户实际反馈：CLI hello 看不到、九个模型不可选/档位不明、发送禁用、Shift+Enter 无效。当前 M2 是实施中的部分候选，不能以工程门禁通过表达可用首版或用户认可。

## 实际复现与根因

使用 Computer use 打开实际 `0.1.0-m2.8 / 0243e4a0-1e4354ec`：旧 Thread `983f85` 为 interrupted，模型/发送确实禁用；原因藏在 thread-setup 滚动区，模型摘要却显示全局“启动时使用”。新会话按钮近似标题，用户没有自然出口。通过新建独立 Thread，九模型菜单及档位确实可操作；原 Thread、hello 草稿保留，未向供应商发送请求。

原生历史点击读取返回 missing：当前读取只指向 App 已绑定目录，不发现 CLI sessions。只读核实该项目的 CLI 原生根有一个 v3 会话，两条消息，用户 hello 确实存在；没有打印回复正文或凭据。修复后的真实 Main 读取函数返回 catalog=1、partial=false、entries=2、helloReadable=true。

Shift+Enter 后粘贴检查文字仍接在同一行，undo 恢复原 hello。最小 Tiptap 仅有原生 Enter 分块，没有 Shift-Enter 注册。真实挂载 Composer 的键盘回归先失败，再补 sourceLineBreak 的 splitBlock，验证正文/草稿同步及撤销。

模型控件以空字符串/default 初始化，与实际 runtime model/thinking 没有接线。真实 React 回归先失败，再回填原生生效模型/档位或启动选择；只读不会拿全局默认冒称当前模型。原生默认保持启动后确认的诚实说明。

## 本次修复范围

- 换行保持每段对应源文本一行，无新增富文本 hard-break 数据。
- 新会话入口改为可识别按钮；草稿旁表达只读/未授权/未启动/未就绪，提供对应的显式操作。保留 cold recovery 只读与 unknown 不自动重发，不能通过放开按钮伪造执行能力。
- 当前模型与思考档位回填，查询筛选不丢失当前选择。
- 为空的会话阅读区提供 CLI 历史入口；历史 tab 自动发现/显示当前项目最近 CLI 保存记录，保留来源选择、显式刷新、分页、缺口说明。
- 新 history IPC 验证来源与 active Thread，配置来源解析后再次核验；只接收不透明 key。Main 按固定 v3 header/canonical cwd 匹配并每次校验，读取不会创建 native binding、迁移或接管执行。256 目录/4096 文件/200记录预算；其它项目、symlink 文件、坏记录不冒充可用。自定义 CLI session-dir 尚不自动发现。

## 漏检与完成边界

旧门禁验证了局部正常模型选择、只读拒绝及文字存储，没有覆盖旧 Thread 冷启动后的可发现出口、实际 Shift+Enter 快捷键与 CLI 历史发现。此前包内验证不能支持“用户能完成这条主流程”；本次补保护具体缺口，不以测试数量替代体验。

当前源码完整检查通过 457 项行为/1 既有 artifact 跳过，后续新增 IPC 异步切换/foreign Thread 回归单项通过。候选构建与 Computer use 复核尚在进行。真实供应商生成、系统 IME 与 M2 其它能力没有因此验收；用户认可保持 pending。
