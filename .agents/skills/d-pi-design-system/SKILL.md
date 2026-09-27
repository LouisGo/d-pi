---
name: d-pi-design-system
description: 用于 d-pi GUI 组件、Tailwind/CSS 样式、主题、密度和外部 UI 源码接入及评审；沿用 shadcn/Base UI 的成熟模式，统一 token 与组件契约。纯样式任务也适用，不用于无关后端或一般文档编辑。
---

# d-pi 样式与组件

先读[设计系统合同](../../../docs/architecture/design-system.md)相关节。复用或调整组件写法时查[固定源码依据](../../../docs/architecture/design-system-references.md)，优先 shadcn 官方 Base UI 版本及 Base UI 官方示例；已有适用证据不用每次重新联网研究。

## 选择实现

- 先检查项目已有组件、token 和 variant，再取上游对应实现。优先 shadcn 语义颜色、size/variant、data-slot，以及 Base UI 公开状态属性/变量；不要另造命名和主题框架。
- 不按“布局 → Tailwind、复杂选择器 → CSS Modules、主题 → 全局 CSS”固定分派，也不要求先尝试一种再用另一种。结合现有代码、上游模式、可读性、复用/作用域、级联影响和修改成本选择或组合；约束共享体系，不规训表达方式。
- 共享视觉值只定义一次：Tailwind 主题映射、CSS Modules、普通 CSS 及必要的 JS 适配都引用同一来源，不手工维护等值副本。允许组件样式就近存放；集中的是设计事实，不是强制所有 CSS 合成一个文件。
- 所有方式使用同一主题与密度来源。普通间距可用 Tailwind 标尺，需要 normal/compact 联动的角色才集中映射；不为每个属性制造 token。
- 布局调用方遵守组件可覆盖范围，内部颜色/尺寸变化通过共享变体处理。需要扩展时修改真正的拥有者及关联验收，不复制组件或提高选择器优先级解决一次性问题。
- 理清级联层、导入顺序和 portal 作用域；类名合并工具不解决 CSS Modules/全局 CSS 的优先级。动态几何可用受控 style/变量，不用它绕过视觉 token。
- 直接取用源码时记录 commit/许可及适配理由，改接项目 Icon Layer；不顺带采用上游图标库、lint 工具或整套模板依赖。对照仓库的不足不是项目惯例。

## 检查与交付

按实际改动运行 Biome、设计 lint 和必要 GUI 检查。S1 起 @shadcn/lint + Oxlint 为设计约束；核实 CSS Modules、自定义类、cn/cva 及合理 CSS 计算的识别范围，以窄配置避免误报，不全局关闭规则。

验证受影响组件的主题、normal/compact、交互状态与焦点；复杂 CSS 检查作用域及邻近页面是否受影响。第三方适配验证公开状态/尺寸变化。缺少实际运行环境时明确只完成文档或静态检查，不声称视觉通过。

新产品选择遵守根 AGENTS.md；CSS Modules 或全局 CSS 的正常使用无需另行审批。本 skill 不授权超出当前任务的依赖安装、原型或产品实现。

## 自动化测试策略

遵循[无头功能合同的 TDD 与自动化策略](../../../docs/architecture/headless-features.md#tdd-与自动化优先2026-09-28)：功能/缺陷修复先失败测试、最小实现、再按需重构；既有行为补测不伪造红灯。默认用可重复测试验证实际行为，不凑数量。Computer use 只补原生系统交互、视觉体验等难以替代的少量证据，或用户明确要求；不把 GUI 验收自动扩成反复手工操作。纯文档/纯样式任务不硬套业务 TDD。
