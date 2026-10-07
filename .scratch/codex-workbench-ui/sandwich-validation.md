# 三层布局验证与交接

2026-10-07。基点 `d4f380c`，实现提交 `5b60446`，修正后的源码/验证提交 `bded41f`，分支 `codex/sandwich-layout`。本页是本轮交接；原包内身份与证据仍属于历史构建，用户认可 pending。

## 行为与真实数据

移除竖栏；列表独立滚动，下方设置宽区/工具窄区固定；顶栏/主内容/28px状态栏固定三层。实时宽度镜像仅写CSS几何，不重写布局偏好；设置Modal保留编辑实例，开发者页切换沿用原Thread模型与草稿合同。未读角标移到导航开关；返回会话使用顶栏文字动作。

状态只读当前Thread公开投影，显示执行状态、有界用户/助手消息数量和排队概况；点击快速预览模型、队列、后台任务、工作目录和窗口覆盖范围。缺失值区分0，gap明示不完整；token/cache/context未接入，不伪造全历史轮数。RuntimePanel与状态栏复用同一phase映射。

## 工程与隔离GUI验证

- 全宽预算回归4项通过；React实际App绑定22项通过，新增覆盖固定dock、真实状态局部更新、消息计数角色范围及Thread切换清空旧状态。
- 最终源码 `pnpm check` 通过：830行为测试、35架构测试、96tooling测试；2个行为测试明确skip。固定官方SDK的localhost集成已运行，未调用真实账户。初次缺少resources/sdk导致两项启动失败，准备固定SDK后完整门禁通过。
- `pnpm build`通过；设计/i18n/交互/文档/架构门禁包含在check中。Impeccable detector无发现。原始最终日志见[工程检查](evidence/sandwich/check.log)、[构建](evidence/sandwich/build.log)。
- [三层专项](evidence/sandwich/native.json)：27项全部通过。包含44px顶栏与28px状态栏、实际列边界、拖拽提交前同步、右/底宿主、导航dock独立滚动、两主题、720×540、覆盖层切换设置/开发者、焦点返回与布局期间编辑实例保持；开发者返回检查Thread controller与草稿。
- [组件看板](evidence/sandwich/components.json)：27项全部通过，涵盖hover菜单命中、弹层Esc、默认尺寸与拖拽/重置、不同窗口/主题、返回会话与键盘入口。
- [原工作台组合回归](evidence/sandwich/regression.json)：68条记录通过（67项检查与1项CDP输入到rAF的帧采样），覆盖最小窗口、中英、两主题、Modal/内层Esc、导航历史、split键盘/取消手势、辅助页签与草稿/阅读状态。帧采样不代表系统输入延迟或长时性能。
- [亮主题](evidence/sandwich/sandwich-light-desktop.png)、[暗主题最小窗口](evidence/sandwich/sandwich-dark-minimum.png)已实际查看；截图内容为隔离fixture。
- 两轴[独立审查](sandwich-review.md)覆盖 `d4f380c→bded41f`。Spec无高价值发现；Standards发现2个P2，均修复并复核，无新增实质发现。

## 实际失败与修复

新原生断言复现嵌套split初始受控尺寸：状态为120px，实际90.6796875px。外层收起与内层首次挂载同帧，库imperative方法用新DOM计算百分比、用旧axis缓存保存像素。adapter观察实际容器轴尺寸并在rAF重施受控值，修后初始120、拖拽150、重置120；保留原reset检查，未降低阈值。

窄窗导航覆盖层新增开发入口后，进入组件页原先仍保留覆盖层。新增回归失败后，developer路由立即抑制open并清理overlay意图，finalFocus指向可见的返回会话按钮；修后覆盖层关闭与焦点两项通过。正文焦点暂藏回归通过，并统一检查所属header/body。

旧验证脚本改为使用当前导航入口，不在隐藏的developer侧栏点击设置/工具；脚本DOM点击显式focus，模拟实际可见按钮点击的焦点语义。原始历史脚本证据不改写。

## Dev试用

依赖、Electron与固定SDK已在本worktree准备，无需打包：

```sh
cd /Users/louistation/.codex/worktrees/sandwich-layout/d-pi
pnpm dev
```

默认App数据为 `/Users/louistation/.d-pi/dev/d-pi-a621096e2d86`（无D_PI_DATA_DIR覆盖时）；不同于原checkout，按README沿用共享OMP原生配置。本轮未复制认证或迁移旧App数据。Dev是可继续修改的源码，版本沿用package.json，build ID为启动快照。

检查列表滚动时设置/工具固定；点击设置/工具；拖动左分隔条检查顶底同步；点击底部对话快速预览；缩到720×540检查导航入口可恢复。右/底宿主在真实内容存在时才开放，fixture截图不代表生产已接入这些示例。

## 限制

本轮工程与隔离Electron结果已交付待试用；没有系统IME/VoiceOver、物理拖窗、长时流式性能或真实供应商证据，原A3缺口继续开放，父规格engineering保持partial、acceptance pending。没有生成固定包、push或远端PR；[本地PR草稿](sandwich-pr.md)记录影响链与回滚。
