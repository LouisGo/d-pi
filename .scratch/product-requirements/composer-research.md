# Composer 路线补充研究

日期：2026-09-25。性质：官方资料核实与工程建议；未实现原型、未最终选择依赖。

## 结论

建议优先验证直接使用 ProseMirror、自建面向 OMP 的 Composer；保留最小 Tiptap 作为对照，Lexical 保留历史研究，不因用户的初步判断就宣称其无法承载。这里的自建指业务节点、交互和提交适配，不是从零写 contenteditable、选区、输入法或撤销引擎，也不默认 fork 上游。

## 已核实与未证实

- [ProseMirror 官方指南](https://prosemirror.net/docs/guide/)描述 schema、EditorState、transaction、EditorView 和插件，以及独立命令、历史和键盘模块。它为定制提供基础，不是开箱即用 Composer。指南搜索索引可读取；直接页面抓取失败，未据此声称所有细节已逐项核实。
- [Tiptap 官方 ProseMirror 文档](https://tiptap.dev/docs/editor/core-concepts/prosemirror)明确基于 ProseMirror，并通过 @tiptap/pm 暴露底层模块；[扩展文档](https://tiptap.dev/docs/editor/core-concepts/extensions)说明可自定义扩展。因此不能说只有直接 ProseMirror 才能深度定制，也不能把 Tiptap 默认界面当成必需界面。
- [Lexical 官方介绍](https://lexical.dev/docs/intro)提供另一套可扩展编辑器基础；尚无本项目实测证明其不适用。
- 检索 OpenAI 官方文档并读取[应用文档入口](https://developers.openai.com/codex/app/)未找到 Codex App Composer 使用 ProseMirror 的可靠实现证据；本机常见应用目录也未发现可核对的安装包。用户提供的实现线索保留为未证实，不将其作为选型依据，更不据此声称是直接使用还是经 Tiptap 包装。

## 对比与判断

| 路线 | 项目收益 | 项目成本 | 当前地位 |
| --- | --- | --- | --- |
| 直接 ProseMirror | 直接控制 schema、transaction、节点和键盘行为，便于限定为专用输入模型 | 自行组合 React 生命周期、命令、插件及序列化；承担更多集成维护 | 建议优先做小原型，未定案 |
| 最小 Tiptap | 复用扩展组织及 React 集成，同时仍可访问 ProseMirror | 需理解两层抽象，检查扩展默认行为、版本及许可 | 具体问题触发后同场景对照，不采用整套富文本产品 |
| Lexical | 保留另一种节点与状态模型的技术选择 | 需另一套业务集成和验证；当前没有必要先做三套完整原型 | 历史候选，不宣称淘汰依据已成立 |

我们的自定义节点与发送语义较强，且不需要文档编辑器的全部工具栏，因此直接 ProseMirror 值得优先验证。这是工程判断，不是性能实测结论。高输入质量本身不证明必须绕开 Tiptap；若直接路线产生大量通用胶水代码而对照方案行为一致，应重新评估维护成本。

## 建议实现边界

- 编辑器持有文字、换行与引用等结构化内容，业务按需定义 schema；不为预期之外的富文本能力扩大模型。
- 文件与选区引用保存标识、路径和范围；选区附加时冻结、@ 文件发送准备时冻结，见[基础契约](../../docs/architecture/foundation-contracts.md)。
- 附件二进制、加载和转换任务属于独立附件管线，编辑器仅关联标识；不把二进制或异步任务放入撤销历史。
- App 管理各 Thread 草稿与恢复；提交适配层转换成 OMP 实际接受的输入，不把编辑器 JSON 直接当 Runtime 协议。
- React 控制周边 UI；编辑区域的更新由编辑器机制管理。组件生命周期、焦点恢复和线程切换必须实测。

## 收敛所需的最小验证

先验证直接 ProseMirror，只有具体集成问题触发时才用同一套场景比较最小 Tiptap：中文 IME 确认不误发、Enter/Shift+Enter、引用节点两侧移动/选择/删除、混合文本与多附件粘贴、撤销重做、异步 @ 查询过期结果、切换 Thread 不串草稿、失败重试不丢内容、重启恢复、长输入及键盘可访问性。记录业务代码和通用胶水维护量，不预设性能胜者。本轮不构建产品、不安装候选依赖。

## 方案收敛更新

2026-09-25：推荐已细化为[直接 ProseMirror 的有限业务实现](foundation-plan.md)，最小 Tiptap 仅在出现具体集成问题时做同场景比较，不默认同时建两套。用户要求先明确方案，本轮没有编写原型；真实 IME 验证留待用户明确进入技术验证阶段。
