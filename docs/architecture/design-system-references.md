# 样式体系的开源依据

核对日期：2026-09-27。只读核对官方文档和下列固定 commit 的源码，未运行其应用，未复制生产代码。仓库星数、宣传文案不作为质量证明；观察到的模式与 d-pi 的适配要求分别记录。

## 首选：shadcn 官方 Base UI 组件与样式

仓库 `shadcn-ui/ui`，commit `98a1fe67b439324ddc857f47fbdce056600a4329`。

- [Base Button](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/bases/base/ui/button.tsx)：使用 Base UI Button，cva 组织 variant/size，cn 组合类名，data-slot 标识部件；视觉变体引用 cn-* 类。
- [Nova 样式](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/styles/style-nova.css)和 [Lyra 样式](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/styles/style-lyra.css)：根样式类下集中定义部件与变体，使用 @apply、语义颜色、状态/子元素选择器，也包含特定几何表达式。
- [主题文档](https://ui.shadcn.com/docs/theming)：CSS 变量与 Tailwind 主题映射，background/foreground、primary/primary-foreground 等角色配对，深浅主题覆盖同名变量。
- [MIT 许可](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/LICENSE.md)。

借鉴：延用已有语义 token 名称和 Base UI 组件结构，组件变体集中定义，状态通过正式 data 属性表达；CSS 文件与 Tailwind 可以共同组织组件样式。源码借用时按实际规模取用，不整包引入全部样式。

边界：Nova/Lyra 是上游视觉风格，差异不只是密度，不直接充当 d-pi 的 normal/compact 开关；目前未选择其中一种外观。根作用域组织和变体方式可复用，密度映射仍需针对 d-pi 验证。不同版本可能将类写在 TSX 或独立样式表，接入时锁版本，不混用两套产物。不能因此新造样式生成器或跨组件主题引擎。

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
