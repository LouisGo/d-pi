# GUI 图标方案：Hugeicons 与自有 Icon Layer

日期：2026-09-25。D-31 已确认 Hugeicons 替代 Lucide；下述组件合同是对用户所附《OMP Icon System》的审查与工程细化，不表示原稿代码已经编译、视觉或打包验收。适用于 d-pi 自有 GUI，不改变上游 OMP TUI。当前只更新文档，不安装依赖、不创建产品组件。

## 选择与已核实的依据

采用 `@hugeicons/react` + `@hugeicons/core-free-icons`，UI 图标统一使用免费 Stroke Rounded。外部库藏在应用自己的 Icon Layer 内，业务视图使用稳定的语义名称。替代 P-04 中的 Lucide 提议，保留自有组件 API 的 B-02 基线；不并行引入第二套通用 UI 图标库，不使用 Pro 图标或已弃用的 `hugeicons-react`。

2026-09-25 只读核实官方资料及 npm 发布包（没有安装）：

| 核实项 | 证据与范围 |
| --- | --- |
| React 接入和免费风格 | [官方 Quick Start](https://hugeicons.com/docs/integrations/react/quick-start)指定上述两个包；免费包为 Stroke Rounded |
| 当前发布内容 | [React 1.1.10 元数据](https://registry.npmjs.org/@hugeicons/react/1.1.10)、[免费图标 4.3.5 元数据](https://registry.npmjs.org/@hugeicons/core-free-icons/4.3.5)与各自 tarball：两者均声明 `sideEffects: false`，随包 `LICENSE.md` 为 MIT；交付时保留相应版权与许可声明 |
| 类型与示例名 | React 包导出 `HugeiconsIcon`、`IconSvgElement`；免费包包含 `GitBranchIcon`、`GitCommitIcon`、`Settings01Icon` 对应模块。实现时以锁定版本的实际导出与类型检查为准 |
| 旧包 | [hugeicons-react 官方仓库](https://github.com/hugeicons/hugeicons-react)标明弃用与迁移建议 |

这是调查时的版本快照，不是已生成的生产锁文件；正式接入时复核并锁定具体版本。MIT 结论限上述免费发布包，不外推到 Pro、第三方品牌商标或外部素材。官方文档/agent skill 可用来查 API、图标名称，不覆盖项目决定，也不因此安装全局 skill。

## 对原方案的审查

| 原方案方向 | 处理及理由 |
| --- | --- |
| 统一来源、语义命名、窄 props、私有自定义图标 | 采纳。把供应商名称和数据格式隔离在视图适配边界，替换字形不影响业务合同 |
| 用 factory 创建所有组件 | 可作为内部实现，不强制。模块顶层工厂调用能否被裁剪取决于实际构建；静态 import 与包的 `sideEffects: false` 不足以证明自有封装的所有未使用图标都被移除 |
| Icon 一律 `aria-hidden` | 保留为装饰 SVG 的固定合同，但外层必须提供按钮名称或状态文本；不能让唯一的信息也被隐藏。Tooltip 不能作为唯一名称来源 |
| Feature 管业务状态、RunStatusIndicator 示例 | 修正为“视图映射业务投影到图形”。权威状态仍归无头功能/Main/Host/OMP；D-15 的 Run 语义未定，不能由示例或图标目录提前定义 |
| 预建 common/navigation/editor/git/agent/status 全目录 | 按实际 GUI 切片建立；当前不预建目录、不包全图库。路径落在 Renderer 视图组件区，不机械复制尚不存在的 `src/components` 路径 |
| `/dev/icons` Gallery | 改为开发态组件样例/预览入口，形式沿用届时工程，不要求 Web 路由，不为此引入路由器；正式 GUI 接入时建设 |
| 所有视觉都统一线性风格 | 约束自有 UI 图标；品牌标识保留原身份规范。Monaco 等嵌入组件内部图标按其公开扩展点评估，不 fork 内部资源或承诺全部强制替换 |

## 分层与组件合同

遵守 [D-28–D-30 无头功能合同](headless-features.md)。依赖方向为：业务合同输出语义数据 → 视图映射 → 应用图标组件 → Hugeicons/自定义 SVG。无头功能、IPC DTO、持久数据不得携带 React 组件、SVG、供应商图标名或为图标选择设计的字段。已有业务 status/kind 可以被不同界面映射，不能为换图标改业务协议。

应用图标只负责画图，不接收点击/Tooltip、读 store、请求数据、启动计时器或判断业务状态。`IconButton` 负责按钮语义、焦点、键盘、禁用与可访问名称；状态呈现组件读取既有投影并组合文字、颜色和图标，不重写状态机或用动画计时伪造进度。纯 SVG 渲染无需逐图标日志，D-21/D-22 诊断仍在实际业务操作链路完成。

初始公共 API：

```ts
export type IconSize = 16 | 18 | 20 | 24;
export interface IconProps {
  size?: IconSize;
  className?: string;
}
```

- 默认 `size=16`、`color="currentColor"`、`aria-hidden={true}`、`focusable={false}`；宽高随 size。统一线宽初始取 1.5，由 Icon Layer 管理，实际小尺寸可读性在 GUI 阶段验收后统一调整，不假定外部库默认值等于项目规范。
- 不继承全部 SVG/vendor props，不向消费者暴露 icon 数据、strokeWidth、absoluteStrokeWidth、fill、替换字形或动画开关；若组件库真的需要 ref 等能力，按具体调用场景增加窄接口，不能直接透传整包属性。
- `className` 用于颜色、布局与必要状态动画；不能绕过 size/线宽约束，用任意 CSS 修改内部路径。光学校正集中在 Icon Layer；旋转等状态效果由外层呈现控制，遵守 reduced motion。
- `SettingsIcon` 等名称描述稳定用途；`Settings01Icon` 等供应商编号只出现在内部映射。不要为不同业务状态大量创建同字形别名；业务含义放在组合组件与文字里。
- 只有图标的按钮用按钮本身的可访问名称；只显示状态图标的区域必须有可见或屏幕阅读器文本，不能仅用红/绿或旋转区别结果。公告频率由状态组件控制，不在每个 SVG 上设 live region。

## 文件组织与接入规则

在未来 Renderer 组件根下按需建立 `icons/`：共享 `types.ts`、必要的内部 adapter、实际使用的类别模块，以及出现真实缺口时才建立的 `_custom/`。具体源码根由工程落地确定，当前不创建骨架。

- 外部包只允许从 Icon Layer 内导入；feature/通用 UI 从类别模块静态导入具名组件，例如 `icons/common`、`icons/git`。避免全量入口和循环依赖，不导入 `_custom` 或内部 factory。
- 内部用静态具名导入，只导出当前使用的语义图标。不 `import *` 整包、不按字符串枚举全图库、不默认提供 `<Icon name="…" />` 万能入口。
- 有真实运行时需求时，视图局部可维护有限的“业务类型 → 组件”映射，并提供未知类型降级。此映射不成为业务注册表；扩展数据不能直接指定任意 import 路径。
- 复制 shadcn/ui、Beautiful UI、Tool UI 等源码时，应用自有控件中的 Lucide/其他图标导入与相关依赖同批迁为 Icon Layer；不为保留示例顺手安装其整套图标包。迁移不改变原组件的可访问性、ref、尺寸与交互合同，差异须在适配处解决。
- 第三方封装控件内部无法公开替换的图标作为明确记录的集成边界，先核实扩展点和代价；不因此开放业务侧混用另一通用图标库，也不把品牌资产当作例外引入整包。

自定义 SVG 仅用于现有字形不能清楚表达的已确认产品概念，先查免费图库，不能为尚未定义的 Run/Checkpoint 预造资产。默认 viewBox `0 0 24 24`、无填充、currentColor、圆端/圆角、线宽 1.5，与外部图标经过相同适配并从类别模块导出。保留来源和许可；不把未知来源 SVG 或含外部资源/脚本的内容直接注入。品牌标识单独管理来源和使用条件，不强制描成线性图标。

## 实施时机、任务边界与验收

本轮完成选型、合同与入口同步；依赖安装、组件实现、截图和打包分析留在获得开发授权后的对应 GUI 切片。图标无头化不等于把图标提前放进无头功能层，也不是 G1 业务接口验证的前置工程。

第一个正式 GUI 切片中，以“当前一条用户路径的 Icon Layer 接入”作为可验收任务：加入两个依赖和窄封装、少量实际图标、对应按钮/状态用法与开发态样例。不把每个图标拆成独立票，也不先铺全产品目录。后续 GUI 票按需补字形并复用合同。

首次接入重点检查：

1. TypeScript 与导入边界检查：供应商仅在 Icon Layer，外部使用语义名称；无头/IPC 不泄漏组件类型。选最小适用的工程检查，不为一个限制新增 ESLint 工具链。
2. 真实 Electron 视觉样例：实际使用字形的 16/18/20/24、浅深主题、按钮/菜单/列表/状态位置、禁用与动态状态；检查对齐、裁切、对比、命中区域、可访问名称和 reduced motion。Gallery 仅包含本项目已用图标，开发入口不进入发布包。
3. 生产 bundle 对照：记录锁定版本与构建模式，比较仅引用一个/少量图标和含未使用导出的情况，检查未使用字形及开发样例是否被移除。出现保留时再调整为可裁剪的直接组件定义，或仅对确认无副作用的工厂使用纯调用标记；不能凭源码 import 形态宣称 tree-shaking 已通过。
4. 在真实使用规模下检查重复渲染、SVG 数量与动画成本；无需给每个无状态 Icon 加 memo/store，也不承诺未实测的体积和帧率。首次基础验收后，新增图标以相关视觉/语义检查为主，封装或构建机制改变时才重测裁剪。

以上验收尚未执行。换库决定已经确定，具体字形、视觉密度和封装实现以实际 GUI 场景校正；需要参考图和视觉对照时在该阶段补齐，不能用文档审查代替视觉验收。
