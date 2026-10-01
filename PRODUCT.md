# d-pi Product Context

<!-- impeccable:product-schema 1 -->

这是项目级 Impeccable 的上下文入口，只引用已有事实；产品需求、决定和授权仍由下列文档维护。

## Platform

web

界面由 Electron 的 React Renderer 承载，产品为 macOS 优先的桌面工具；这里的 `web` 是 Impeccable 的渲染技术分类，不代表手机网页或新增平台承诺。

## Product Purpose

在 OMP 内核之上提供 GUI，改善输入、输出、流式执行掌控与透明呈现。已确认的目标、使用流程与取舍见[产品需求](docs/product/requirements.md)和[首版方案](docs/product/first-release.md)，不将最终能力清单当作当前已实现功能。

## Capabilities and Constraints

- 当前范围、规格、交付与验收从[项目总看板](docs/status.md)进入；已确认选择见[决定登记](docs/decisions.md)。
- 执行、原生历史、提交 unknown 与恢复边界遵守[基础契约](docs/architecture/foundation-contracts.md)，界面必须表达真实状态。
- 自有文案与语言范围遵守[国际化架构](docs/architecture/internationalization.md)和[产品术语](docs/product-terminology.md)。

## Operating Context

技术栈及环境以 [package.json](package.json) 和 [README](README.md) 为准；GUI 工程与验证遵守 [AGENTS.md](AGENTS.md)。已有文档足以回答的背景无需再次访谈，真正未决的产品选择仍保留待决。
