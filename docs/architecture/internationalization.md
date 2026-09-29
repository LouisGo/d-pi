# d-pi Internationalization Architecture

## 1. 目标

d-pi 的国际化方案服务于一个很具体的目标：

> 让 d-pi 的产品界面能够稳定支持多语言，同时不让 i18n 渗透进 Agent Runtime、业务状态和 OMP 协议。

i18n 应当是一层轻量、可靠的产品基础设施，而不是新的框架中心。

当前阶段优先支持：

- `system`
- `zh-CN`
- `en-US`

未来增加其他语言时，不应要求重构现有业务代码。

---

# 2. 设计原则

## 2.1 只翻译 d-pi 自己拥有的文案

国际化的边界不是“用户能看到的字符串”，而是：

> **d-pi authored product copy**

需要翻译：

- 菜单
- 按钮
- Tooltip
- Placeholder
- 空状态
- Settings
- Toast
- Dialog
- Approval UI
- 状态展示
- Accessibility label
- Electron 原生菜单
- d-pi 自己定义的错误说明

不翻译：

- 用户输入
- Agent 输出
- Thinking 内容
- Tool output
- Bash stdout / stderr
- 文件路径
- URL
- 代码
- Git 内容
- Provider 返回内容
- Model name
- Tool name
- OMP protocol field
- OMP 原始 error message

例如：

```ts
{
  tool: "bash",
  status: "running"
}
```

`bash` 和 `running` 都是稳定的领域数据。

Renderer 最终可以显示：

```text
Bash · 运行中
```

但不能把业务状态变成：

```ts
status: "运行中"
```

---

## 2.2 i18n 属于 Presentation，不属于 Runtime

OMP 不感知 d-pi 的 UI locale。

SessionHost 不负责翻译。

Run state machine 不保存翻译后的字符串。

Session replay 不记录翻译结果。

Agent Event 不因为 UI Language 不同而发生变化。

正确的数据流：

```text
OMP / SessionHost
        │
        │ stable domain data
        ▼
Renderer
        │
        │ presentation mapping
        ▼
Localized UI
```

而不是：

```text
OMP
 ↓
translated state
 ↓
Renderer
```

---

## 2.3 UI Language 和 Agent Language 是不同概念

d-pi 中至少存在三种不同的语言语义。

```text
UI Language
Conversation Language
Artifact Language
```

### UI Language

决定 d-pi 自身界面。

例如：

```ts
uiLocale = "zh-CN"
```

控制：

- Settings
- Sidebar
- Composer
- Approval
- Menu
- Dialog
- Toast

---

### Conversation Language

决定 Agent 如何与用户交流。

例如：

```text
d-pi UI：中文

用户：
Please review this implementation and answer in English.

Agent：
English
```

UI Locale 不应进入 Agent request。

如果未来提供：

```text
Agent Response Language
```

它应该是独立产品能力，例如：

```ts
type ResponseLanguagePreference =
  | "auto"
  | "zh-CN"
  | "en-US"
```

不复用 `uiLocale`。

---

### Artifact Language

代码注释、README、文档等产物应遵循：

- 用户明确要求
- Repository 现有语言
- AGENTS.md
- 项目规范
- 当前上下文

不增加全局 `artifactLanguage` 设置。

这属于 Agent 对任务和 Repository 的理解，而不是 Desktop UI preference。

---

# 3. 总体架构

```text
                         Desktop Preferences

                     localePreference
                system | zh-CN | en-US
                            │
                            ▼
                    Locale Resolver
                            │
                     resolvedLocale
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼

        Electron Main                  Renderer

        Native Menu                    React UI
        Native Dialog                  Tooltip
        Notification                   Placeholder
        App-level Copy                 Toast
              │                        Settings
              │                        Approval UI
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼

                      Shared i18n Core

                    typed message keys
                    ICU formatter
                    locale catalogs


─────────────────────────────────────────────────────────

                    Agent / OMP Runtime

                           │
                           │
                    language-neutral
                       domain data
                           │
                           ▼

                     SessionHost
                           │
                           ▼
                       Renderer

─────────────────────────────────────────────────────────
```

核心边界：

```text
Main        ┐
            ├── consume i18n
Renderer    ┘

SessionHost ── does NOT consume i18n

OMP         ── does NOT consume i18n
```

---

# 4. Locale Model

不要把：

```text
system
```

解析以后覆盖成：

```text
zh-CN
```

它们是两个不同概念。

定义：

```ts
export type SupportedLocale =
  | "zh-CN"
  | "en-US"

export type LocalePreference =
  | "system"
  | SupportedLocale
```

Preference：

```ts
localePreference: "system"
```

Resolved：

```ts
resolvedLocale: "zh-CN"
```

二者应始终分开。

---

## 4.1 为什么保留 `system`

假设用户设置：

```text
Language: System
```

今天系统是中文：

```text
resolvedLocale = zh-CN
```

之后用户把 macOS 改成英文。

下次启动应该自动得到：

```text
resolvedLocale = en-US
```

而不是因为之前曾经解析成中文，就永远停留在中文。

---

# 5. Locale Resolution

System locale 由 Electron Main 负责解析。

“跟随系统”取 `app.getPreferredSystemLanguages()[0]`；首选语言列表为空时才回退到 `app.getLocale()`。`app.getSystemLocale()` 对应区域格式，不用于决定界面语言。

Renderer 的：

```ts
navigator.language
```

只作为异常情况下的 fallback，不作为 Desktop 应用的 authoritative source。

基本逻辑：

```ts
function resolveLocale(
  preference: LocalePreference,
  systemLocale: string,
): SupportedLocale {
  if (preference !== "system") {
    return preference
  }

  return normalizeSystemLocale(systemLocale)
}
```

当前只需要非常简单的归一化：

```text
zh*
    → zh-CN

everything else
    → en-US
```

不需要现在实现复杂的：

- locale negotiation engine
- Accept-Language parser
- RFC 4647 matching
- dynamic fallback tree

等真正增加：

```text
zh-TW
ja-JP
ko-KR
...
```

时再扩展。

---

# 6. Desktop Preference Ownership

Locale Preference 属于 d-pi Desktop。

例如：

```ts
interface DesktopPreferences {
  locale: LocalePreference
}
```

它和下面这些设置属于同一层级：

```text
theme
window behavior
sidebar preference
editor appearance
```

不应该进入：

```text
OMP config
Session
Thread
Run
Workspace domain model
```

原因很简单：

> Locale 描述的是“这个客户端如何展示”，而不是“这个 Agent Session 是什么”。

---

# 7. Shared i18n Core

i18n 不应该成为 Renderer 专属模块。

原因是 Electron Main 同样存在用户可见文案：

- Application Menu
- Edit Menu
- View Menu
- Native Dialog
- Notification
- Window action

因此采用：

```text
shared i18n core
        │
    ┌───┴───┐
    ▼       ▼
  Main   Renderer
```

而不是：

```text
Main
  ↓ locale

Renderer
  └── entire i18n system
```

---

# 8. Library

使用成熟 ICU Message Format 实现。

推荐：

```text
@formatjs/intl
```

不自行实现：

```ts
message.replace("{count}", value)
```

也不维护自定义 plural 系统。

需要解决的是：

```text
interpolation
plural
select
number
date
```

这些都是标准国际化问题，不属于 d-pi 应该重新发明的领域。

例如：

```ts
{
  "approval.files":
    "{count, plural, =0 {No files} one {# file} other {# files}}"
}
```

中文：

```ts
{
  "approval.files":
    "{count} 个文件"
}
```

业务层仍然只调用：

```ts
t("approval.files", { count })
```

---

# 9. 不直接暴露 FormatJS

业务组件不应该知道：

```text
FormatJS
IntlMessageFormat
IntlProvider
PluralRules
```

统一通过薄 facade：

```ts
const { t } = useI18n()

t("composer.send")

t("approval.files", {
  count: files.length,
})
```

Main 中同样使用：

```ts
i18n.t("menu.edit")
```

FormatJS 是 implementation detail。

未来即使替换底层库，也不应该影响大量业务组件。

---

# 10. Message Catalog

目录按产品领域拆分。

推荐：

```text
src/shared/i18n/
├── locale.ts
├── catalog.ts
├── create-i18n.ts
├── types.ts
└── locales/
    ├── en-US/
    │   ├── common.ts
    │   ├── app.ts
    │   ├── menu.ts
    │   ├── sidebar.ts
    │   ├── thread.ts
    │   ├── composer.ts
    │   ├── approval.ts
    │   └── settings.ts
    │
    └── zh-CN/
        ├── common.ts
        ├── app.ts
        ├── menu.ts
        ├── sidebar.ts
        ├── thread.ts
        ├── composer.ts
        ├── approval.ts
        └── settings.ts
```

这种拆分只是：

> source organization

不是 runtime namespace。

最终仍然 compose 成一份 catalog：

```ts
export const enUSMessages = {
  ...common,
  ...app,
  ...menu,
  ...sidebar,
  ...thread,
  ...composer,
  ...approval,
  ...settings,
}
```

不要因此引入：

- namespace loader
- language registry
- plugin locale runtime
- dynamic import system
- remote language pack
- lazy translation bundle

当前 d-pi 完全不需要。

---

# 11. Message Key

使用稳定的 semantic key。

例如：

```text
composer.send
composer.placeholder
composer.stop

thread.new
thread.rename
thread.delete

approval.allow
approval.reject
approval.remember

settings.language
settings.theme
```

不要使用英文原文作为 key：

```text
"Send"
"New conversation"
"Allow once"
```

文案会变化。

产品语义更稳定。

---

# 12. Type Safety

英文 catalog 作为 canonical schema。

例如：

```ts
export const messages = {
  "composer.send": "Send",
  "composer.placeholder": "Ask anything",
  "thread.new": "New thread",
} as const
```

Message key 类型：

```ts
export type MessageKey =
  keyof typeof enUSMessages
```

于是：

```ts
t("composer.send")
```

合法。

```ts
t("composer.sned")
```

TypeScript 直接报错。

当前阶段不需要构建复杂的代码生成 pipeline。

能通过普通 TypeScript 得到的约束，不引入额外 generator。

---

# 13. Message 参数

动态内容必须通过完整 message 表达。

正确：

```ts
t("approval.fileCount", {
  count,
})
```

错误：

```ts
t("approval.prefix")
+ count
+ t("approval.files")
```

不同语言存在：

- 不同语序
- plural
- 量词
- 标点
- 空格规则

因此基本原则：

> 一个用户看到的自然语言句子，应尽可能对应一个完整 message。

---

# 14. Domain State 不本地化

以下设计禁止出现：

```ts
type RunStatus =
  | "等待中"
  | "运行中"
  | "已完成"
```

应该始终是：

```ts
type RunStatus =
  | "pending"
  | "running"
  | "completed"
```

Renderer：

```ts
function getRunStatusLabel(
  status: RunStatus,
  t: TFunction,
) {
  switch (status) {
    case "pending":
      return t("run.status.pending")

    case "running":
      return t("run.status.running")

    case "completed":
      return t("run.status.completed")
  }
}
```

同样适用于：

```text
approval status
tool status
connection state
git state
run state
session state
```

稳定 ID 属于 Domain。

翻译属于 Presentation。

---

# 15. Error Handling

错误需要区分两种来源。

## Product Error

d-pi 自己定义的错误：

```ts
{
  code: "SESSION_RESTORE_FAILED"
}
```

Renderer 可以映射：

```ts
t("error.sessionRestoreFailed")
```

---

## External Error

OMP / Git / Bash / Provider 返回：

```text
fatal: not a git repository
```

原始内容不翻译。

可以在外面增加 d-pi 自己的解释：

```text
恢复会话失败

fatal: not a git repository
```

而不是：

```text
恢复会话失败

致命错误：不是一个 Git 仓库
```

否则可能改变：

- 搜索关键字
- 错误语义
- Debug 信息
- Stack trace
- 用户复制内容

---

# 16. Renderer Integration

Renderer 只需要一个很薄的 Context。

概念上：

```ts
interface I18nContextValue {
  locale: SupportedLocale

  t(
    key: MessageKey,
    values?: MessageValues,
  ): string
}
```

使用：

```tsx
function SendButton() {
  const { t } = useI18n()

  return (
    <Button>
      {t("composer.send")}
    </Button>
  )
}
```

不要在业务组件里出现：

```ts
locale === "zh-CN"
```

也不要出现：

```ts
new Intl.PluralRules(...)
```

Locale-specific behavior 应集中在 i18n infrastructure 内。

---

# 17. Electron Main Integration

Main 初始化时：

```text
read preference
      ↓
resolve system locale
      ↓
create i18n instance
      ↓
build application menu
```

语言切换后：

```text
User changes language

        ↓

persist localePreference

        ↓

resolve locale

        ↓

update Renderer

        +

rebuild native menu
```

Native menu 和 Renderer 必须使用同一个 `resolvedLocale`。

不能出现：

```text
Renderer：中文

macOS Menu：English
```

---

# 18. Language Switching

界面切换语言不需要重启 App。

基本流程：

```text
Settings
   │
   ▼

setLocalePreference()

   │
   ├── persist preference
   │
   ├── calculate resolved locale
   │
   ├── update Main i18n
   │
   ├── rebuild native menu
   │
   └── notify Renderer
```

UI 更新不需要等待磁盘 persistence 完成。

也就是：

```text
interaction first
persistence second
```

但如果 persistence 最终失败，应记录日志。

不需要因为写配置失败回滚整个 UI。

---

# 19. HTML Language Metadata

Renderer 更新 locale 时同步：

```ts
document.documentElement.lang = locale
```

未来支持 RTL 时：

```ts
document.documentElement.dir =
  getDirection(locale)
```

当前 zh-CN/en-US 均为：

```text
ltr
```

不需要进一步设计 RTL layout infrastructure。

但保留这个正确入口即可。

---

# 20. Terminology

翻译文件不能解决产品术语不统一的问题。d-pi 只维护一份很短的术语表：[product-terminology.md](../product-terminology.md)。

该表是产品术语与界面文案的单源：设计稿、代码、文档、中英文 UI 表达同一个产品模型。本文件不复制该表，只约束使用边界——术语随产品演进修改，不要求一开始把所有 Agent 术语定义完。

一处需要留意的同名不同义：术语表的 `Thread`（中文 UI 显示为“会话”）指用户在应用里持续推进的工作单元，与领域层由 OMP 管理的原生会话不是同一对象。当前单会话设计下两者一一对应，界面靠位置与动作区分；多 Thread 落地时须重新校对中文用词。领域定义见 [CONTEXT.md](../../CONTEXT.md)。

---

# 21. Validation

第一版只保留三个检查。

## 21.1 Key Parity

所有支持的 locale 必须包含相同 message key。

---

## 21.2 ICU Validation

所有 message 在 CI 中进行格式合法性检查。

防止：

```text
missing brace
invalid plural
invalid interpolation
```

进入生产环境。

---

## 21.3 Hardcoded Copy Guard

对主要 Renderer UI 目录做轻量扫描。

目标不是做到完美 AST 静态分析。

目标只是防止新的明显用户文案继续散落：

```tsx
<Button>Delete thread</Button>
```

如果确实需要保留 literal：

```ts
// i18n-ignore: protocol identifier
"bash"
```

显式说明。

不要构建复杂 ESLint plugin 或独立 compiler。

简单规则能够覆盖大多数问题即可。

---

# 22. Fallback

默认 fallback：

```text
requested locale
       ↓
en-US
```

当前只有：

```text
zh-CN
en-US
```

因此不构建多层 fallback chain。

Message 缺失应：

开发环境：

```text
console error
```

生产环境：

```text
fallback en-US
```

如果英文也不存在，最后显示 message key。

例如：

```text
approval.unknownState
```

这虽然不好看，但比 silent blank 更容易发现问题。

---

# 23. Logging

i18n 只记录基础诊断：

```text
resolved locale
locale change
missing key
invalid message
preference persistence failure
```

不要引入：

- i18n telemetry subsystem
- translation metrics pipeline
- remote locale diagnostics

普通日志足够。

---

# 24. 当前不做的事情

以下能力在需求出现之前不实现。

## 不做 Dynamic Language Pack

不支持：

```text
用户自行安装语言包
插件注册语言包
远程下载 locale
```

---

## 不做 Translation Management Platform

不接：

```text
Crowdin
Lokalise
Phrase
```

当前两种语言、单人/小团队开发没有必要。

---

## 不做 Locale Plugin Runtime

不建立：

```ts
registerLocale()
registerNamespace()
registerTranslationProvider()
```

没有真实 extension use case。

---

## 不做 Translation Lazy Loading

几十 KB 的语言文件不是 d-pi 当前性能问题。

不要为了理论上的 bundle optimization 增加 runtime complexity。

---

## 不做自动 Agent Language Injection

UI 是中文，不代表：

```text
Please answer the user in Chinese.
```

应该被自动加入 system prompt。

这两个系统保持独立。

---

## 不做所有 External Error Translation

外部系统错误保持原样。

---

## 不做自动 Message Language Detection

暂时不检测每条 Agent Message：

```text
Chinese
Japanese
English
...
```

未来如果出现真正的：

- CJK glyph
- typography
- accessibility
- speech

需求，再加入 message-level language metadata。

---

# 25. 推荐代码结构

最终建议：

```text
src/
├── shared/
│   └── i18n/
│       ├── locale.ts
│       ├── types.ts
│       ├── catalog.ts
│       ├── create-i18n.ts
│       └── locales/
│           ├── en-US/
│           │   ├── common.ts
│           │   ├── app.ts
│           │   ├── menu.ts
│           │   ├── sidebar.ts
│           │   ├── thread.ts
│           │   ├── composer.ts
│           │   ├── approval.ts
│           │   └── settings.ts
│           │
│           └── zh-CN/
│               ├── common.ts
│               ├── app.ts
│               ├── menu.ts
│               ├── sidebar.ts
│               ├── thread.ts
│               ├── composer.ts
│               ├── approval.ts
│               └── settings.ts
│
├── main/
│   └── i18n/
│       └── locale-service.ts
│
└── renderer/
    └── i18n/
        ├── i18n-provider.tsx
        └── use-i18n.ts
```

除此之外：

```text
docs/
└── product-terminology.md
```

足够。

---

# 26. 模块职责

## `shared/i18n`

负责：

```text
SupportedLocale
LocalePreference
message catalog
message typing
ICU formatting
fallback
```

不知道：

```text
Electron IPC
React
OMP
SessionHost
```

---

## `main/i18n`

负责：

```text
system locale
Desktop preference
resolved locale
native menu localization
locale change broadcast
```

---

## `renderer/i18n`

负责：

```text
React context
useI18n()
rerender on locale change
document lang
```

---

## SessionHost

没有 i18n 模块。

这是有意设计。

---

# 27. 实施顺序

不要一次完成“国际化系统”。

按照 UI 自然生长逐步落地。

### Step 1

建立：

```text
SupportedLocale
LocalePreference
shared catalog
t()
```

加入：

```text
zh-CN
en-US
```

---

### Step 2

迁移当前主要 UI：

```text
Sidebar
Thread
Composer
Settings
Approval
```

---

### Step 3

加入 Desktop language setting：

```text
System
简体中文
English
```

---

### Step 4

Main 接入 locale：

```text
native menu
native dialog
```

---

### Step 5

增加：

```text
key parity
ICU validation
basic hardcoded-copy check
```

到 CI。

到这里第一版结束。

---

# 28. 未来扩展触发条件

架构允许扩展，但不提前实现。

只有出现明确需求时再增加。

### 新语言超过约 4–5 种

再考虑：

```text
translation management tooling
automated extraction
more sophisticated locale validation
```

---

### Catalog 明显变大

再考虑：

```text
code generation
catalog extraction
namespace tooling
```

不是现在。

---

### 第三方 Plugin 可以贡献 UI

再考虑：

```text
locale registration
plugin namespace
language extension API
```

---

### 大量不同语言 Message 产生字体问题

再考虑：

```text
message language metadata
language detection
language-aware typography
```

---

### 支持 Arabic / Hebrew

再完善：

```text
RTL
dir
logical CSS properties
layout mirroring
```

---

# 29. 最终决策

d-pi 的 i18n 采用：

```text
Shared typed catalog
        +
ICU Message Format
        +
Desktop-owned locale preference
        +
Main / Renderer shared locale contract
        +
Presentation-only localization
```

不把它发展成：

```text
i18n framework
language plugin platform
translation runtime
```

核心模型只有：

```text
localePreference
      ↓
resolvedLocale
      ↓
shared catalog
      ↓
Main / Renderer presentation
```

Agent Runtime 始终位于这套系统之外。

---

# 30. Architecture Rule

整个方案最终可以压缩成五条规则：

> **1. Domain 保存意义，UI 决定表达。**

> **2. 只翻译 d-pi 自己拥有的文案。**

> **3. UI Language 不等于 Agent Language。**

> **4. Main 和 Renderer 共用语言系统，SessionHost 不参与。**

> **5. 没有真实需求之前，不增加新的 i18n 抽象。**

这五条比具体选择哪个 i18n library 更重要。

只要这些边界保持稳定，底层实现可以持续演进，而不会反过来污染 d-pi 的产品模型与 Agent 架构。
