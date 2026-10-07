# Beautiful UI 基础视觉体系 Dev 交接

日期：2026-10-07。工程完成，源码 Dev 已交付待试用，用户认可 pending。

## 源码与运行

- 源码目录：`/Users/louistation/.codex/worktrees/beautiful-ui-system/d-pi`。
- 分支：`codex/beautiful-ui-system`；基点 `7906f2553746801fddc892290b38b4269a69bd6e`。
- 实现提交 `1573c3154fdd193246d002079f97078cc3b4c48e`，最终代码修正 `cae44367ef5e4d6d1176314c83e405c722bca576`，设计规范提交 `1a75147`；其后提交仅补交接/状态/证据。
- 在上述目录执行 `pnpm dev`。默认 App 数据目录为 `/Users/louistation/.d-pi/dev/d-pi-4ff1e52c08b9`；实际覆盖以启动终端为准。OMP 原生配置继续沿用项目策略。原 checkout 未修改。
- 进入开发者工具的组件看板 `/dev/components`，切换 light/dark，试用按钮、输入、选择、原生控件、浮层，再回到会话/设置检查真实入口。无需发送模型请求。

## 交付内容

Beautiful UI 为视觉和动效对照：中性常规主操作、蓝色强调、轻表面边界、浅层阴影、文字动作胶囊、小圆角图标/输入、统一短反馈。集中 token 保持唯一权威；[DESIGN.md](../../DESIGN.md) 与 [.impeccable/design.json](../../.impeccable/design.json) 引用 CSS 值。

Button/Input/Select/Switch/ChoiceGroup/导航/Tab/Tooltip/Menu/Modal/状态浮层及容器均消费共享配方；新增 Checkbox、TextArea、Slider、Disclosure/DisclosureTrigger，提取可复用 Tooltip。原生 props/ref、表单语义、Base UI 焦点语义继续保留。真实消费者覆盖模型、队列、附件、编辑发送、文件、运行信息、子代理、阅读历史、诊断和设置。组件看板收录 21 项，新增控件使用实际交互示例。

hover/active/selected/disabled/invalid 区分；普通鼠标焦点不绘制 outline，键盘 focus-visible 保留。reduced-motion 禁用相应 transition。未改变执行、恢复、授权或持久化合同。

## 验证与证据

- 新控件 3 项测试先失败后通过，验证表单/ref/禁用、错误关联和展开后保留输入。
- 8 个相关测试文件 61 项、焦点/菜单/页签 3 个文件 4 项，共 65 项通过。记录：[定向测试](evidence/targeted-tests.txt)、[交互测试](evidence/interaction-tests.txt)。日志保留既有 act 警告，不将其隐去或称为零警告。
- Renderer 类型检查与 `pnpm build` 通过；构建仍有既有大 chunk 提示。[构建日志](evidence/build.txt)、[最终门禁](evidence/checks.txt)记录相关检查，没有声称运行完整 `pnpm check` 或全业务矩阵。
- [contrast.json](evidence/contrast.json)：两主题 20 对颜色通过，强调白字约 5.0:1、Checkbox 必要边界超过 3:1；颜色计算证明 token 对比度，不冒充浏览器 hover 观测。
- macOS CUA 操作隔离 Electron，运行真实 App/组件与 mock DesktopBridge；固定 1440×900、720×900，均为 @2x。观测 Checkbox Space、Slider 方向键、Disclosure 收起/展开保留草稿、Select 搜索不改值与 Esc 回焦、Modal Esc 回焦、Tooltip 键盘显示/关闭。[原生观测](evidence/native-observations.json)与 13 张截图可追溯。
- 独立 Spec/Standards 评审和视觉评审的发现、修正及复核范围见[评审记录](review.md)。

截图使用最终代码内容的源码 Renderer；fixture 构建标识保留基点/dirty=true，不作为代码提交身份或包身份。它们证明记录的组件视觉与交互，不证明真实 provider、固定包、VoiceOver、系统 IME 或物理拖拽。未为本轮运行这些无关或未受影响的验证。

## 必要复现

`node .scratch/beautiful-ui-system/preview.mjs 1440` 或 `720` 启动隔离 fixture，Ctrl-C 退出并清理自身临时环境。该入口用于复现组件证据；用户日常试用使用 `pnpm dev`。`node .scratch/beautiful-ui-system/contrast.mjs` 复算颜色门槛。截图中的系统共享提示/指针高亮属于 macOS，不是应用样式。

本轮仅本地提交与 Dev 交付；未推送、创建远端 PR 或合入 main。
