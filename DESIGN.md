# d-pi Design Context

## Overview

这是 Impeccable 的既有设计上下文入口，不是新的视觉方案或 token 副本。当前应用已有视觉体系；局部功能继承现有组件及周边界面，不能因缺少某个上游产物而当作空白项目重设计。

工作区域采用 `Operate`，长文阅读区域参考 `Read`。优先清晰的任务、状态与熟悉的操作；表达风格服从真实使用场景。

## Colors

语义颜色和深浅主题以 [tokens.css](src/app/renderer/styles/tokens.css) 为唯一视觉值来源；传播、覆盖与检查规则见[设计系统合同](docs/architecture/design-system.md)。此文件不复制色值。

## Typography

沿用当前实现的字体与文字角色，字号来源同为 token；系统字体和紧凑的信息呈现可用于桌面工具，不因通用反模式提示更换字体。

## Layout

normal/compact、窗口布局及第三方编辑器适配遵守[设计系统合同](docs/architecture/design-system.md)；控件密度与阅读字号分别判断。现有实现是证据，不意味着用户已认可全部体验。

## Components

Base UI 基础交互与 shadcn 源码复用遵守项目组件 API；图标经自有 Icon Layer，见[图标合同](docs/architecture/icon-system.md)。接入和按需使用 Impeccable 的规则由 [d-pi-design-system](.agents/skills/d-pi-design-system/SKILL.md)维护。

## Do's and Don'ts

- 复用实际组件、token 和 variant；真实 GUI 检查覆盖受影响主题、密度、状态、焦点及语言。
- 不为单个页面另造色板、重绘共享组件、关闭设计 lint 或引入第二套图标库。
- 产品、工程与用户验收边界读取 [AGENTS.md](AGENTS.md) 和所属规格；设计工具评分不替代这些证据。
