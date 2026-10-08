# Composer 本地交接

2026-10-08。最新为本文末尾 **07 普通带图输入修复**（基点25e8c58 + review manifest固定WIP）。下方06记录是历史交付源码 `6b39d19`、反馈基点 `2fdeab2`；分支 `codex/composer-quality`，工作树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`。仅修改此树，没有新建实施树、修改原 checkout、push、远端 PR 或发布。

## 本轮结果与试用

- 正常草稿 dirty/saving/checking 安静运行，不再在输入区增加状态行；保存与核对仍执行。真实失败保留正文、紧凑提醒、重试/核对与全选，冲突保留比较与恢复。
- 修共享焦点来源：鼠标进入文本区后，空格/换行/光标键不转换成键盘焦点；Tab、实际键盘焦点迁移与独立辅助技术焦点仍按 focus-visible。没有 Composer 局部 outline 覆盖或 lint 放松。
- 成功导入不再长驻报告；成功显示只来自当前缩略图/内联节点。结算是资源事实，当前采用以草稿为准；删除/Undo 后不再因旧结算报告显示“已插入”。去重后未采用源仍正常 release，隐藏报告不停止 settlement。
- 失败、部分采用、待插入、取消及结算失败保持可操作；移除后的结算错误不保留失效预览，重试也不重新采用。导入提示改为无嵌套边框的紧凑列表，长文件名只展示一处，预览/取消动作保留完整可访问名称；单项取消不再重复批量入口。窄窗工具栏按可用宽度换行。

参照 T3 固定 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631` 的 ChatComposer Surface/Banner/Prompt/Toolbar、composerDraftStore 采用与移除职责，复用 d-pi Base UI/token。T3 当前本地 HEAD 为 `30cc788`；参考固定版本，不引入其架构或新依赖。

在该树试用：

```sh
cd /Users/lou/.codex/worktrees/composer-quality/d-pi
PATH="/tmp/dpi-composer-node:/tmp/dpi-composer-tools:$PATH" pnpm dev
```

Node24.21.0/pnpm12.8.1 已核实。上述 PATH 使用当前存在的固定运行时/工具 shim；本机默认 pnpm 的自动版本切换有 ENOEXEC，不把启动环境失败混作产品缺陷。没有改全局环境。

请验证连续输入（含空格/中文 IME/换行/光标）、鼠标与 Tab 焦点、图片删除与重复粘贴、文件 Undo/Redo、混合批次部分失败/取消、快速切 Thread、窄窗/深浅主题及错误恢复。按用户安排，Agent 未启动 Dev、GUI、浏览器、Computer use/E2E 或真实 provider/Host 发送，实际视觉/OS/IME/VoiceOver 仍未验证，用户认可 pending。

## 本轮工程证据

原始日志见 [quiet-composer](evidence/quiet-composer/provenance.md)，最终 39 文件 302 项行为通过；全类型、check:fast、设计/交互/i18n 与 build 通过。新增反例的实际红灯为 6 失败/32 通过，首轮修复后 38 通过；随后补了真实 saving/checking 恢复与未结束结算时文件 Undo/Redo。扩展检查发现两个旧 UI 断言仍要求 pending 文案和冗长取消标签，已改为新合同的安静状态与 aria-label 验证；并修正 image preview fixture 的额外字段。

完整 `pnpm check` 未重跑；早期 CLI fixture 及固定 SDK PDF fixture 失败仍根因 unknown，不纳入本次 UI 修复也不宣称全绿。build 既有 chunk 大小提示、路由生成的 circular dependency 提示保留。来源/评审/试用认可分别维护，静态 detector `[]` 不代表截图质量。

## 上一轮附件语义交付（历史快照 e0c43e5）

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

## 最新交接：07 普通带图输入修复

用户已授权实现和本地commit，基点25e8c58，仅现有 `/Users/lou/.codex/worktrees/composer-quality/d-pi`，分支codex/composer-quality；本轮不启动GUI，用户自行试用，原checkout未修改，没有push。

已完成二进制私有资源→冻结摘要引用→宿主校验→OMP边界Base64。小图保持原字节；>10MiB使用公共独立worker压缩，源25MiB/总100MiB与库存预算保留，发送图片总40MiB及内部编码64MiB为应用预算。原件及派生lease保留，转换信息可见。旧收据兼容读取，停止/缺失/损坏/超预算在未转发时明确拒绝并保留草稿。ACK原子消费/unknown不重发保持。

公共入口 `src/platform/node/images/public.ts`，共享策略 `src/shared/image-policy.ts`；runtime/image-compression.mjs二进制压缩、image-input.mjs只读水合随固定SDK同步/hash。SDK环境准备成功，用户退出旧d-pi后资源锁已释放；日常仍从上述worktree `pnpm dev`试用，不需要打包。

34文件299项、tooling111、architecture35、typecheck/fast/design/i18n/build/完整环境通过，两轴独立review关闭派生manifest发现后无剩余高价值问题。[本轮证据](evidence/image-input/provenance.md)。实际provider接收、GUI压缩提示/视觉质量与原生交互由用户验证；峰值RSS/长会话性能未测，旧完整check失败记录不删除。

兼容风险：新版本能读取旧内嵌收据，但旧源码不识别新资源引用；Main/Renderer/宿主/helper/SDKmanifest须同版运行。revert源码不会撤销已持久新收据、原件/派生物或OMP执行；降级时保留数据并恢复匹配版本，不能删除数据库或自动重发。
