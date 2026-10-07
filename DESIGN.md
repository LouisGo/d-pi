# d-pi Design Context

## Overview

这是 Impeccable 的既有设计上下文入口，不是新的视觉方案或 token 副本。当前应用已有视觉体系；局部功能继承现有组件及周边界面，不能因缺少某个上游产物而当作空白项目重设计。

工作区域采用 `Operate`，长文阅读区域参考 `Read`。优先清晰的任务、状态与熟悉的操作；表达风格服从真实使用场景。

## Colors

现有界面采用冷中性色与蓝色主操作。侧栏、阅读底面和输入／控件表面分层；选中导航使用柔和的 accent 与对应前景色，避免把选中项表现为新的主操作。语义颜色和深浅主题以 [tokens.css](src/app/renderer/styles/tokens.css) 为唯一视觉值来源；传播、覆盖与检查规则见[设计系统合同](docs/architecture/design-system.md)。此文件不复制色值。

## Typography

使用系统字体，控件、辅助信息与阅读正文分别消费文字角色；阅读正文保留更舒适的字号与行高。字号来源同为 token，不用全局缩放替代控件密度。

## Layout

项目导航固定在侧栏，工作区依次呈现配置入口、项目与运行状态、阅读导航／内容和底部 Composer。辅助区域使用分隔线与中性底面，避免每一层都套卡片。长设置按预算独立滚动，阅读导航在窄窗口横向滚动；输入操作允许换行，最小窗口的布局预算由共享 token 调整。空工作区保留明确的项目入口。上述是存量组合；目标四区域与底部宿主见[布局方案](.scratch/codex-workbench-ui/layout.md)，第一轮范围见[布局开工计划](.scratch/codex-workbench-ui/layout-first.md)。取消密度切换，原 compact 尺寸作为唯一默认紧凑布局，light/dark 均必备；窗口布局及第三方编辑器适配遵守[设计系统合同](docs/architecture/design-system.md)；控件密度与阅读字号分别判断。现有实现是证据，不意味着用户已认可全部体验。

## Components

基础、配套与业务组件使用同一角色体系；圆角、间距、文字、颜色和交互状态不因使用位置任意变化。颜色及状态关系在同一 token 来源联动。应用只使用 d-pi 自有公开组件；Base UI 基础交互与 shadcn 源码复用遵守项目组件 API；Button 的主操作、ghost 与 navigation 变体以及 icon 尺寸由共享组件拥有，调用方只安排布局。图标经自有 Icon Layer，见[图标合同](docs/architecture/icon-system.md)。接入和按需使用 Impeccable 的规则由 [d-pi-design-system](.agents/skills/d-pi-design-system/SKILL.md)维护。

## Do's and Don'ts

- 复用实际组件、token 和 variant；真实 GUI 检查覆盖受影响主题、密度、状态、焦点及语言。
- 不为单个页面另造色板、重绘共享组件、关闭设计 lint 或引入第二套图标库。
- 产品、工程与用户验收边界读取 [AGENTS.md](AGENTS.md) 和所属规格；设计工具评分不替代这些证据。
