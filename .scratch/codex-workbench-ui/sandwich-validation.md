# 三层布局验证与交接

2026-10-07。基点 `d4f380c`，分支 `codex/sandwich-layout`，隔离目录 `/Users/louistation/.codex/worktrees/sandwich-layout/d-pi`。当前工程检查进行中；用户认可 pending。

## 行为与真实数据

移除竖栏；列表独立滚动，下方设置宽区/工具窄区固定；顶栏/主内容/28px状态栏固定三层。实时宽度镜像仅写CSS几何，不重写布局偏好；设置Modal、Thread资源和developer全宽显示保持。未读角标移到导航开关；返回会话使用顶栏文字动作。

状态只读当前Thread公开投影，显示执行状态、有界用户/助手消息数量和排队概况；点击快速预览模型、队列、后台任务、工作目录和窗口覆盖范围。缺失值区分0，gap明示不完整；token/cache/context未接入，不伪造全历史轮数。RuntimePanel与状态栏复用同一phase映射。

## 已完成验证

- full-width预算回归：旧几何契约扣除rail、修改后的测试失败；移除rail预算后4项几何测试通过。React实际App绑定22项通过，新增覆盖固定dock、真实状态局部更新、消息计数角色范围及Thread切换清空旧状态。
- `pnpm typecheck`、设计lint、i18n lint、交互政策、架构/文档检查与`pnpm build`通过。Impeccable detector无发现。
- [三层专项](evidence/sandwich/native.json)：23项隔离Electron检查通过。包含44px顶栏与28px状态栏、实际列边界、拖拽提交前同步、右/底宿主、导航dock独立滚动、两主题、720×540、覆盖层切换设置、焦点返回与编辑资源保持。
- [亮主题](evidence/sandwich/sandwich-light-desktop.png)、[暗主题最小窗口](evidence/sandwich/sandwich-dark-minimum.png)已实际查看；其内容为隔离fixture，不是生产终端/真实供应商。

## 尚在进行

原工作台交互回归、完整工程门禁与双轴独立review。固定SDK资源在本worktree独立准备，先前缺少resources/sdk导致两项测试启动失败，不改变产品目标。

## 限制

CDP鼠标/键盘与实际Electron几何证明本轮布局；没有系统IME/VoiceOver、物理拖窗、长时流式性能或真实供应商证据，原A3缺口继续开放。不生成固定包；本轮试用用Dev。
