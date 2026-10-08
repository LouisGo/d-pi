## Summary

Composer 补全确认与异步附件曾缺少统一原位置/焦点/取消结算契约。本地切片交付M1键盘/IME守护、caret补全和附件体验；M2复用Thread-owned输入模型，混合粘贴文本即时应用，文件原位置稳定批次采用、单独Undo，部分失败及PDF仅文本均显式确认。范围见[spec](spec.md)。

## Evidence

行为实现 `3b932e04`，基点 `a9cf9a9d`，本地分支 `codex/composer-quality`。[验证](validation.md)包含真实PM/Main/SQLite/React红绿与Dev观测；[Spec/Standards评审](review.md)的3个P2已关闭。组合1181passed/2skipped/1既有CLI fixture失败，完整check不是全绿；最终增量预览相关38、modal关闭/Composer/reference47通过；其他检查与build通过。用户认可pending，实机IME/VoiceOver/缩放/长会话/provider/Host queue未验证。

## Merge Danger

共享input/IPC影响所有Composer入口；Main接受后取消依赖真实release ACK，不能提前解除发送屏障。新optional operationId兼容旧payload，新增settlement需同版Main/preload/Renderer；无SQLite迁移、无新增执行权限，沿既有import pin/history lease。回滚源码不会撤回已保存草稿/已导入资产，仍由旧生命周期回收。回滚时先关闭本构建，保留App数据，不删除数据库或OMP历史。可逆内部改动，已保存用户数据不能凭revert恢复旧内容。当前仅本地交付，未创建远端PR。
