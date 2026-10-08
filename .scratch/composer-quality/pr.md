## Summary

旧Composer把项目@重复放入外部附件栏，三个技术Disclosure割裂正文，底栏与附件缺少统一交互。此切片按用户截图重做连续输入表面：项目文件/目录只内联；外部图片缩略图与文件chip分区；模型与真实执行权限在左，附件/展开/More/发送在右，维护按需打开。用d-pi共享Base UI、Button、Icon和token组合，参照固定T3 ChatComposer组件分工，保留原业务协调器与发送边界。

M1补齐caret附近补全、单次确认、Escape、IME/键盘优先级、原子引用和详情焦点；M2复用Thread-owned输入模型，实现文本即时应用、文件映射原位置批次采用与独立Undo、取消/部分失败/PDF仅文本确认/跨Thread晚到隔离。随后修复展开焦点、连续隐藏锚点导航、管理关闭映射bookmark、原生picker首次/重试取消与自动完成不抢焦点。

## Evidence

本地分支codex/composer-quality，基点a9cf9a9d，最终代码3918b64。最新Composer/input/picker回归17文件127项通过；保留input/Main/可信clipboard15文件105项、共享弹层6文件18项与前者有重叠。类型、fast、design/interaction/i18n、结构/架构与build通过。[验证](validation.md)保留原始红绿与构建身份，[独立评审](review.md)的Spec/Standards发现均关闭。fresh原生finish review仅对浅色宽窗给出ship，用户认可pending。

pnpm dev实际验证项目只内联、图片/长文件名、候选确认/继续输入、展开/More/管理关闭、浅深色与565px停靠内容视口；最新超限→重试取消→成功后立即输入保持正文焦点。较早两个Thread草稿与Undo/Redo证据保留，未冒称新布局逐项重跑。

较早完整check为1181 passed / 2 skipped / 1既有configuration-sharing CLI fixture失败，完整check不是全绿。真实IME/VoiceOver/200%缩放/长会话、OS mixed paste/drop全集、实机PDF及provider/Host queue未验证。见[交接](handoff.md)。

## Merge Danger

共享input/IPC影响所有Composer入口；Main接受后取消依赖真实release ACK，不能提前解除发送屏障。新增settlement需同版Main/preload/Renderer；无SQLite迁移，沿原import pin/history lease，不新增执行权限或队列。回滚前关闭当前构建并保留App数据；源码revert不撤回已保存草稿/资产，不能删除数据库或OMP历史来清理。当前仅本地交付，无远端PR、push或发布。
