# 样式体系的开源依据

核对日期：2026-09-27。只读核对官方文档和下列固定 commit 的源码，未运行其应用，未复制生产代码。仓库星数、宣传文案不作为质量证明；观察到的模式与 d-pi 的适配要求分别记录。

## 首选：shadcn 官方 Base UI 组件与样式

仓库 `shadcn-ui/ui`，commit `98a1fe67b439324ddc857f47fbdce056600a4329`。

- [Base Button](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/bases/base/ui/button.tsx)：使用 Base UI Button，cva 组织 variant/size，cn 组合类名，data-slot 标识部件；视觉变体引用 cn-* 类。
- [Nova 样式](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/styles/style-nova.css)和 [Lyra 样式](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/styles/style-lyra.css)：根样式类下集中定义部件与变体，使用 @apply、语义颜色、状态/子元素选择器，也包含特定几何表达式。
- [主题文档](https://ui.shadcn.com/docs/theming)：CSS 变量与 Tailwind 主题映射，background/foreground、primary/primary-foreground 等角色配对，深浅主题覆盖同名变量。
- [MIT 许可](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/LICENSE.md)。

借鉴：延用已有语义 token 名称和 Base UI 组件结构，组件变体集中定义，状态通过正式 data 属性表达；CSS 文件与 Tailwind 可以共同组织组件样式。源码借用时按实际规模取用，不整包引入全部样式。

边界：Nova/Lyra 是上游视觉风格，差异不只是密度，不能把上游两套风格当作密度实现；目前未选择其中一种外观。根作用域组织和变体方式可复用，默认尺寸需针对 d-pi 验证；2026-10-06 已取消 normal/compact 切换，采用唯一默认紧凑布局。不同版本可能将类写在 TSX 或独立样式表，接入时锁版本，不混用两套产物。不能因此新造样式生成器或跨组件主题引擎。

## 首选：Base UI 官方 CSS Modules

仓库 `mui/base-ui`，commit `45a75a5785046af3700ac5671ecde620cdff8900`。

- [Popover 示例](https://github.com/mui/base-ui/blob/45a75a5785046af3700ac5671ecde620cdff8900/docs/src/app/(docs)/react/components/popover/demos/hero/css-modules/index.tsx)实际导入共享的 [_index.module.css](https://github.com/mui/base-ui/blob/45a75a5785046af3700ac5671ecde620cdff8900/docs/src/app/(docs)/react/components/popover/demos/_index.module.css)。
- CSS 使用组件暴露的尺寸/transform-origin 变量、data-starting-style/data-ending-style、侧向属性及伪元素，管理定位、过渡和箭头。
- [官方 Styling](https://base-ui.com/react/handbook/styling)将 Tailwind、CSS Modules 等列为正常接入方式；[MIT 许可](https://github.com/mui/base-ui/blob/45a75a5785046af3700ac5671ecde620cdff8900/LICENSE)。

借鉴：复杂状态与几何使用组件局部 CSS，优先官方变量和稳定属性，不猜测内部 DOM。样式文件可由同一组件多个示例/变体复用，不必所有样式挤入 JSX。

边界：示例的白色、灰阶、像素尺寸用于演示，不作为 d-pi 色板。接入时替换视觉值为项目 token；几何常量不必伪装成全局设计 token。

## 应用对照：同技术栈 Dashboard

仓库 `towerneon/shadcndashboard-ui`，commit `6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b`。这是源码对照样本，不是经本轮运行验收的整套模板推荐。

- [依赖](https://github.com/towerneon/shadcndashboard-ui/blob/6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b/package.json)包括 React/Vite、Tailwind v4、Base UI 和 Tiptap。
- [globals.css](https://github.com/towerneon/shadcndashboard-ui/blob/6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b/src/css/globals.css)集中导入基础、组件风格和页面适配；[Button](https://github.com/towerneon/shadcndashboard-ui/blob/6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b/src/components/ui/button.tsx)沿用 cva/size/variant。
- [Tiptap.css](https://github.com/towerneon/shadcndashboard-ui/blob/6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b/src/components/apps/blog/editor/Tiptap.css)及 [app.css](https://github.com/towerneon/shadcndashboard-ui/blob/6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b/src/css/pages/app.css)用普通 CSS 适配富文本与第三方内容；[MIT 许可](https://github.com/towerneon/shadcndashboard-ui/blob/6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b/LICENSE)。

借鉴：真实应用会组合 Tailwind 与专门 CSS，富文本内容需要清楚的样式归属。

不照搬：查阅文件存在硬编码色值/尺寸、较宽的选择器及多处 important，也使用不同于本项目的图标与 lint 工具。不能因为技术栈相同就整套复制、迁入依赖，或宣称已满足全局密度联动。

## d-pi 的采用方式

以 shadcn 官方 Base UI 组件/语义主题为主要来源，Base UI 官方 CSS Modules 为复杂交互样式参照；应用仓库仅补充组织经验。Tailwind [自定义样式](https://tailwindcss.com/docs/adding-custom-styles)作为全局层、组件层和自定义工具类机制的依据。

- 上述源码是选择依据。可复用的模式是：CSS Modules、受作用域约束的全局 CSS 与 Tailwind 平等消费同一变量；`@apply` 用于可读的共享组件规则；动态定位与运行时尺寸通过受控 style/CSS 变量表达。
- 主题名称优先复用 shadcn，新增 token 仅补项目实际缺口。
- 选择方式、token 唯一入口、级联层与 lint 例外等**规则**由[设计系统合同](design-system.md)规定；本页只记录源码中观察到的做法与出处，不复制规则。

正式引用源码时记录来源、commit、许可和本地改动理由，保留必要许可声明。本轮仅记录来源和模式，不固定额外依赖、具体风格或全量文件结构。

## AI 组件的写法与配套组织（2026-10-06）

本次补充只读源码比较，未安装、运行或复制生产组件。Beautiful UI 固定 `44a274e598395ab61e7c96c26fda2758780253b7`；Tool UI 固定 `49a870286facdbf28160cd647f0d337ebdc9b275`。两者根许可证均为 MIT；实际复制时仍需核对选中文件及传递依赖。抓取范围/哈希见[补充清单](../../.scratch/codex-workbench-ui/evidence/component-source-manifest.json)。

| 所读源码 | 可参考的写法 | d-pi 采用判断 |
| --- | --- | --- |
| Beautiful UI [Button](https://github.com/slev12397/beautiful-ui/blob/44a274e598395ab61e7c96c26fda2758780253b7/components/atoms/Button.tsx) | 原生 button + cva variant/size；视觉角色由组件管理 | 当前已有 Base UI Button，不另复制一套。上游 ink/canvas 色板、任意尺寸及外观需改为 d-pi token/variant |
| Beautiful UI [PromptBar](https://github.com/slev12397/beautiful-ui/blob/44a274e598395ab61e7c96c26fda2758780253b7/components/primitives/PromptBar.tsx) / [TaskRows](https://github.com/slev12397/beautiful-ui/blob/44a274e598395ab61e7c96c26fda2758780253b7/components/primitives/TaskRows.tsx) | 输入周边组合、状态行层次和动效 | 所读源码含演示步骤/计时器，PromptBar 还有 glimm 接入；优先借鉴结构，用自有配套组件组合，不替换 Tiptap 或复制演示运行状态 |
| Tool UI [ApprovalCard](https://github.com/assistant-ui/tool-ui/blob/49a870286facdbf28160cd647f0d337ebdc9b275/apps/www/components/tool-ui/approval-card/approval-card.tsx) / [schema](https://github.com/assistant-ui/tool-ui/blob/49a870286facdbf28160cd647f0d337ebdc9b275/apps/www/components/tool-ui/approval-card/schema.ts) | 可序列化数据与回调分开；交互卡片与结果呈现分开 | 可作为配套交互结构参考；schema 不替代 OMP 请求/世代/过期校验，原有批准/拒绝类型不等于 d-pi 全部交互 |
| Tool UI [shared adapter](https://github.com/assistant-ui/tool-ui/blob/49a870286facdbf28160cd647f0d337ebdc9b275/apps/www/components/tool-ui/shared/_adapter.tsx) / [card adapter](https://github.com/assistant-ui/tool-ui/blob/49a870286facdbf28160cd647f0d337ebdc9b275/apps/www/components/tool-ui/approval-card/_adapter.tsx) | 将 Button、Separator、cn 等项目依赖集中在适配入口 | 可借鉴依赖替换点；改接 d-pi 自有组件。仅替换导入尚不足以形成稳定的 d-pi 公开 API |
| Tool UI [ActionButtons](https://github.com/assistant-ui/tool-ui/blob/49a870286facdbf28160cd647f0d337ebdc9b275/apps/www/components/tool-ui/shared/action-buttons.tsx) / [useActionButtons](https://github.com/assistant-ui/tool-ui/blob/49a870286facdbf28160cd647f0d337ebdc9b275/apps/www/components/tool-ui/shared/use-action-buttons.tsx) | 动作描述、显示、局部防重复和异步回调分工 | 本地交互瞬态不能成为执行事实；源码从调用层覆盖 Button 圆角/padding，不能原样带入 d-pi，应转为共享 variant；确认倒计时仅在产品语义需要时采用 |

结论：基础控件薄封装 Base UI/shadcn；可复用的 AI 配套表达先使用自有控件组合，再按适配成本选择源码改造；业务绑定保留在所属功能。Beautiful UI/Tool UI 是重要写法参考，不成为应用直接消费的 API。所有实现方式都遵守[自有组件合同](design-system.md#自有组件库与实现选择2026-10-06)，本页不新增并列规则或第二套组件技术路线。
