# S4 前国际化基础

当前结构化状态由此块维护，下文有日期的过程记录保留当时语境。

```project-status
[
  {
    "id": "i18n",
    "title": "国际化基础",
    "phase": "基建",
    "engineering": "complete",
    "trial": "delivered",
    "acceptance": "pending",
    "build": "0.1.0-i18n.0",
    "evidence": [
      "handoff.md"
    ],
    "next": "等待热切换与输入体验反馈"
  }
]
```

日期：2026-09-29。依据：用户本轮明确要求先分析当前写死语言，再将引用对话的完整方案作为项目基准落盘，并按当前标准流程、TDD 完成开发。基准为[国际化架构](../../docs/architecture/internationalization.md)，决定记为 D-36；沿用 D-02/D-03/D-21/D-22/D-29/D-34/D-35。当前任务独立于 S4，只覆盖已实现的产品路径；不提前实施 S4 文件/Diff，不改变官方 OMP、执行恢复或 S3 待试用状态。

## 交付与验收

- 交付结果：保存 `system`/`zh-CN`/`en-US` 的 Desktop 偏好，Main 解析系统 locale，与 Renderer 使用同一结果；界面切换无需重启。已存在的 d-pi 自有文案进入英/中 catalog。运行时与历史仍传稳定状态、码和原始内容，由展示层生成文案。
- 范围外：Agent 回复语言、产物语言、OMP 配置、远程语言包、翻译平台、S4/M2 功能。外部错误和原生交互正文保留原样。
- 自动验收：偏好迁移/恢复及非法值、IPC 回执与变更通知、语言切换后的 UI 与菜单、跨层稳定码与原生正文保真、ICU 解析和 key parity、主要 UI 硬编码防回归；受影响 TypeScript/Biome/设计检查和构建。
- 体验交接：提供正常/紧凑及明/暗主题下的语言选择步骤、系统语言重启解析、菜单和对话框检查；自动测试不替代用户试用。

## 现有写死语言分类（实施前盘点）

| 类别 | 当前例子与位置 | 处理 |
| --- | --- | --- |
| d-pi 自有静态 UI | `src/renderer/app.tsx` 导航/主题/空态；`composer.tsx` 草稿/保存/按钮；`conversation.tsx` 提交/历史；`runtime-panel.tsx` 执行控制/交互辅助语；`index.html` 固定 `lang` | 按完整自然句进入语义 key；HTML `lang` 随解析语言变化 |
| d-pi 自有原生 UI | `src/main/index.ts` 菜单、项目选择、日志/关闭/退出对话框 | Main 使用同一 catalog；语言变化重建菜单，未来弹窗读当前 locale |
| d-pi 自有跨层展示 | `src/main/runtime-service.ts` 的状态/配置说明、`src/main/draft-service.ts` 与 `src/features/submission/coordinator.ts` 的安全错误；`src/features/runtime/model.ts`、`submission/model.ts` 的通知；`conversation/projection.ts` 的应用标签/截断提示 | 传稳定码与受限参数，由 Renderer 当前 locale 格式化；不在 Host、执行状态或持久记录中保存翻译结果 |
| 原样内容 | 草稿与提交原文、用户/Agent/工具消息、OMP 原生交互标题/选项、外部错误、路径/URL/模型名/工具名 | 不翻译、不改写；产品自有解释可以独立本地化 |
| 稳定标识及开发诊断 | `kind`/`phase`/`role`/错误 `code`、IPC channel、内部 `Error(...)`、测试 fixture、Zod issue | 内部保持稳定；直接暴露给用户的状态需映射成产品文案，测试与诊断字符串不作为 UI 词条 |

已发现的边界缺口：`safeMessage`/`RuntimeView.message` 当前直接携带中文；`ConversationItem.label` 混合工具名和产品标签；preload 偏好回执只比较主题与密度；Main 创建菜单时尚未读取持久偏好。这些都须随接入修正，不将现有中文继续封装在翻译 facade 里。

## 实施顺序与任务

1. [01 共享 locale 与 Desktop 偏好](issues/01-locale-preference.md)：先失败测试，落实解析、ICU facade、v5 存储、IPC、Main 菜单/弹窗与切换通知。
2. [02 跨层语义文案](issues/02-semantic-copy.md)：先失败测试，更新状态/失败/会话投影合同，保留原生正文，再在展示层按当前 locale 格式化。
3. [03 现有界面迁移](issues/03-renderer-copy.md)：先失败测试，完成可见 UI、辅助功能、动态句和语言选择。
4. [04 校验与交接](issues/04-validation-handoff.md)：key parity、ICU、主要 UI 硬编码守卫、受影响检查、真实 GUI 样本和用户试用步骤。

其中 01 的核心、02 的合同和 03 的静态界面可并行；整体验收需等待三者集成。FormatJS 的 `createIntl` 需随 locale/catalog 更换实例；ICU 格式合法性可用官方 parser 检查，见[官方 API](https://formatjs.github.io/docs/intl/)和[parser 文档](https://formatjs.github.io/docs/icu-messageformat-parser/)。

## 推进与交接

- 当前范围与授权：上述 S4 前 i18n 基础，用户明确授权文档、盘点、TDD 开发与必要验证；不扩展 S4/M2，不推送。
- 产品判断：已定方案按 D-36；当前无额外重要待决产品问题。若实现暴露与现有决定冲突，记录证据再对齐。
- 工程状态：版本 `0.1.0-i18n.0` 源码实现完成；复核后修正 `system` 首选语言来源和 SDK 缺失恢复提示。`pnpm check` 179 项通过、1 项可选 smoke 跳过，`pnpm build` 通过；隔离 Electron GUI 的中英切换、原生菜单/项目对话框、深色紧凑样本及带未保存草稿、选区和撤销历史的热切换已观察。见[交接](handoff.md)。
- 用户试用：已交付待试用，尚无体验认可。S3 原试用结论仍待用户反馈，不因本切片自动变成认可。
- 继续边界：本轮 i18n 基础已完成工程交付；用户反馈在本切片内修正。S4 文件/Diff 开发另按其切片推进。
