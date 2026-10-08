# Composer 本地交接

2026-10-08。源码 `e0c43e507554ee09268eef3fa050b906f698d8af`，分支 `codex/composer-quality`，隔离工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`。本轮反馈增量从dd8d812开始，整个任务基于原checkout的a9cf9a9d；原 `/Users/lou/Learn/d-pi` 仍为该HEAD且干净。未push、创建远端PR或发布。

## 试用

请在隔离工作树运行，原checkout不包含本次实现：

```sh
cd /Users/lou/.codex/worktrees/composer-quality/d-pi
pnpm dev
```

使用项目声明的Node24.21.0/pnpm12.8.1。既有Dev进程已停止；按用户本轮要求，Agent未启动新Dev/GUI/E2E。视觉及真实交互由用户验收，工程通过不代表截图已达到用户认可。

## 已实现

- 外部图片只在上方缩略图栏，增删不进入PM文档或Undo/Redo；正文Undo不影响图片，原Redo分支保留，草稿持久化、重挂载、不可变发送仍携带图片。
- 其他文件在正文内联，MIME优先的图标/配色、截断文件名及大小，参与Undo/Redo。HTML、Markdown、文档、PDF、音视频、压缩包、表格和普通文件有各自呈现；项目@和冻结项目上下文继续仅内联。
- 同ID及同源文件去重；外部来源比较名称/MIME/大小和Main验证摘要，改变内容不误合并，跨Thread不采用。未用的clipboard clone/import alias等待真实清理或settlement ACK。
- 移除默认重复的大块文件失败面板。状态放在对应chip/缩略图标记，预览、重试和PDF仅文本确认在详情中；无对应节点的请求失败仍显示明确恢复动作。DOCX/视频等格式的展示不等于新增内容转换支持。
- M1补全、键盘/IME守护、原子节点导航、详情/显式采用焦点沿既有组件组合；M2文本即时应用、文件原位置映射、批次Undo、取消/partial/Thread隔离继续复用。语言变化不撤销导入位置，自动完成不抢焦点，显式采用回到正文。
- 冷恢复分类前保护未知附件依赖，读取失败可显式重新加载。图片迁出仍映射导入落点，分类和标签刷新不写脏草稿；冻结引用旁的原有空行与原文保留。

参考固定 [T3 ChatComposer](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/chat/ChatComposer.tsx) 与 [composerDraftStore](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/composerDraftStore.ts) 的组合表面、images/files/prompt分工及采用去重，用d-pi共享token/Base UI/Icon Layer实现。保留原Draft v1、Main资源lease、可信clipboard、不可变提交、原生queue；无IPC/DB迁移。

Main租约按source ID保留各版本摘要，只迁出Main确认的外部图片；文件及共用摘要的旧版本仍受保护，update失败不提前清理，retry先恢复update再release。冻结原文中的私有token字样在准备、草稿采用和持久扫描中均不授予附件身份，普通段落的非法/未知token仍拒绝。

## 验证和限制

[验证](validation.md#2026-10-08-图片独立文件内联与去重)包含最终50文件369项通过、完整类型检查、fast/design/i18n/interaction和build，以及[原始证据](evidence/attachment-semantics/provenance.md)。[独立评审](review.md)记录固定范围与发现。数字不与先前或worker重叠集合合计。

本轮没有实机或视觉通过结论。请重点试图片增删＋正文Undo/Redo、DOCX/HTML/MD/视频内联呈现、重复拖入/粘贴、冷恢复、快速切Thread、IME期间异步导入、错误详情和焦点。真实IME marked-text、VoiceOver、缩放/窄窗、长会话及OS竞态由用户验证；provider/Host queue未重新发送。

仍有明确限制：现有Main不支持DOCX/视频等内容转换，失败状态不会伪装ready；固定SDK PDF复制fixture本次失败，未改1b50c88也同样失败，根因未定位。先前完整check中的configuration-sharing CLI fixture失败仍保留，未宣称完整check全绿。M3压缩/Markdown、历史召回、M4slash等不在本次范围。工程交付与用户认可分开，acceptance仍pending。
