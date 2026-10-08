# UI纠正的原生操作记录

2026-10-08，Computer Use操作实际Electron App；从隔离worktree执行pnpm dev，不使用DOM fixture代替画面。截图直接展示在本会话CUA工具输出；没有返回可保存路径，因此不虚构PNG文件。Main事件只白名单保留fixture Thread的阶段/构建/请求字段，不保存个人项目或业务全文。

## 范围与身份

- worktree：`/Users/lou/.codex/worktrees/composer-quality/d-pi`，branch：`codex/composer-quality`。
- project：`/private/tmp/dpi-composer-native`；Thread B：`20fd4c35-2a2e-4f13-b4de-b818fa475dce`。
- 连续UI初次固定Dev：fee53ddf，Main build fee53ddf-ef3241b6，process 584a0f7a-a525-4c95-9e46-ee2f2795f999。
- 最后picker链固定Dev：3918b64，Main build 3918b64a-dirty-2eee4843，process 33bb81f0-36f4-4e00-806c-53fc29aac675。dirty仅交接记录，源文件已经提交且启动后无行为热更新。
- 仅浏览，没有授予项目执行权限，没有发送provider请求。顶部允许执行提示和仅浏览状态来自真实现有模型，没有照抄截图的Full access。

## 实际结果

| 场景 | 观察结果 |
| --- | --- |
| 内联项目引用与外部附件 | alpha.ts只出现正文TS/name chip；外部sample.png为缩略图，note.txt为紧凑file chip，project reference不进入外部栏 |
| 默认布局 | 附件与正文共享连续输入卡，底栏model/access在左、icon操作/send在右；三个技术Disclosure不在默认输入区 |
| @src/候选 | 类型/文件名/路径可见；Enter确认后继续中文文本输入，保留正文焦点。普通中文粘贴不证明真实IME |
| 展开 | 正文继续输入“展开后输入”，底栏在扩展输入表面底部；收起回同一editor |
| 管理Modal | 按需打开，关闭后不点击正文直接粘贴“弹窗关闭后输入”；AX消息value更新，焦点为消息输入 |
| More | fresh reviewer实际操作后菜单可见，键盘偏好进入次级菜单，实际有效Enter行为与展开状态一致 |
| 主题与宽度 | 浅色/深色宽窗；DevTools停靠使实际内容视口565×780时，正文和底栏换行、More可见，无横向溢出。该视口不代表OS所有尺寸 |
| 长文件名 | 原生picker导入D-PI_Composer_长文件名与布局边界_2026-10-08_补全键盘附件焦点验收.txt，file chip截断后大小和删除按钮保留 |
| 首次picker取消 | 836f591取消后直接粘贴“取消选择后继续输入”，消息value确有新增文字，正文焦点恢复 |
| 超限错误 | 3918b64选择27262976字节too-large-picker-fixture.txt，明确显示“原件超出25 MiB限制”，有重试/移除动作 |
| 重试取消 | 点击重试准备，系统picker取消后不点正文直接粘贴“重试取消后继续输入”。错误仍保留，消息value新增文本，焦点为消息输入 |
| 重试成功 | 再次重试，选择40字节success-picker-fixture.txt，错误消失、新file chip出现。立即粘贴“导入成功后继续输入”仍进入正文且AX焦点保持 |
| 鼠标与键盘焦点 | 最后实际坐标点击正文，画面只有caret没有outline；系统GoTo快捷键之后显示focus-visible outline属于键盘状态。fresh reviewer亦实际鼠标点击展开并核实无outline |

## 证据限制

早期部分CUA截图和AX出现不一致帧，另有ScreenCaptureKit -3811，随后重新绑定/取实际无遮挡画面完成核实。没有把失败捕获当作当前确定产品缺陷。fresh reviewer结论ship限浅色宽窗收起/展开/More/鼠标焦点；后续主题、停靠视口、长名称与picker链由root核实。

仍未验证真实CJK marked-text/候选确认、VoiceOver、OS尺寸全集/200%缩放、30min长会话性能、原生mixed paste/drop完整竞态、实机PDF/其余错误组合、provider/Host queue。此前两个Thread/Undo/Redo实机结果见上级验证页，不能冒称新布局逐项重新验收。工程交付不代表用户认可。
