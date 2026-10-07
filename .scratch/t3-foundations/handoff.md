# T3 基础重构交接

2026-10-07。集成分支 `codex/t3-foundations`，固定基点 `598323321c8c2ba6eb177097e2042510c3b79d87`，工作树 `/Users/louistation/.codex/worktrees/t3-foundations/d-pi`。原 checkout 保持不变。

完整研究结论在 [research](research.md)，产品选择和工程状态单源在 [spec](spec.md)，最终检查及两轴 review 在 [07](evidence/07-integration.md)。本地可审查 [PR 草稿](pr.md) 未 push/创建远端 PR。

## 当前可试用范围

原生 typed failure 与 Host 任务生命周期、Files/Git 只读取消及共享资源预算、Thread 附件来源、编辑撤销/GC 资产保护、阅读内容锚点、诊断 Writer 源头安全及故障恢复。结构化剪贴板可搬运私有图片与冻结选区，目标新 ID、一次 Undo/Redo；原动态引用跨 Thread 复制暂时显示可读降级。

动态文件/目录搬运还需决定版本与权限语义：推荐复制时冻结所选来源及版本；其他选择是发送时读取原项目，或仅允许同工作目录动态搬运。用户尚未选择，不能据此关闭04和总目标07，也不能声称完整退出标准达成。

## Dev 试用

```sh
cd /Users/louistation/.codex/worktrees/t3-foundations/d-pi
pnpm dev
```

1. 附件与 Undo：导入图片/PDF，删除并保存，打开附件存储清理，再 Undo，内容仍能准备发送。PDF 转换失败后成功重试的同 ID 也受保护。若明确提示撤销历史预算，查看提示，只有选择“清除撤销历史并重试”才释放 Undo；正文保持。
2. 跨 Thread 复制：复制含文字、私有图片或已冻结选区的输入，切至另一 Thread 粘贴，一次 Undo 移除本次粘贴，Redo 恢复同一目标附件。过期或无有效 App handle 的剪贴板明确降级；动态 @引用当前不会读取目标项目同名文件。
3. 阅读：在历史/对话中滚到中间，调节窗口宽度、隐藏/展开 Composer、切换阅读页或 A→B→A，回到同内容条目。live generation 与 native session/page 分别记录，不靠文本猜合并。
4. 读取：快速更换 Files/Changes 资源并返回，内容归原资源；旧请求取消且 shared Query 仍有 observer 时继续服务。Git shared active/queue 有界，明确失败不解析部分输出。
5. 诊断：打开诊断，核对当前退化、历史拒收/丢弃/追加未确认与留存失败分开显示。原始秘密/路径/业务全文不作为诊断属性写入。

Dev 的 App 数据按 checkout 路径隔离，终端显示实际目录；OMP 配置及认证仍沿用现有解析策略，App 数据隔离不等于 OMP 配置/会话隔离，见 README。本轮自动化边界验证使用单独临时配置、SQLite 和离线 fixture，无执行请求。自动化准备成功不等于真实供应商执行通过。用户试用和明确认可均仍待反馈。

## 再继续时

先读 spec 的推进与交接，确认动态引用选择；在该分支和工作树继续04依赖部分，并刷新受影响测试、最终独立评审及组合检查。保留 Main/Host/OMP 所有权、unknown 不重发及冷恢复只读。未收到选择前，其他已验证工作和可操作试用保持可用，不自行打开跨项目读取权限。
