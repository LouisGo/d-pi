# 02 分类交互看板

Status: resolved
Blocked by: none

阶段：基建；依据：所属[规格](../spec.md)。独立实现Agent负责。

交付：按用途分类的完整基础组件看板，名称/用途/变体/状态，真实交互和局部重置，搜索空状态，主题沿用应用。包含规格基础清单；HoverMenu由主Agent集成。

写集：src/app/renderer/developer/components/ 下独立页面、目录数据、CSS、行为测试；不写路由、shell或共享组件。

验收：组件目录与源码覆盖、交互切换/关闭/重置/搜索，真实基础组件直接复用，无业务请求。工程验收不包含用户认可。

完成：实现与集成、完整工程门禁及独立双轴评审通过；候选与验证见[交接](../handoff.md)及[验证](../validation.md)。用户认可另由父规格维护。
