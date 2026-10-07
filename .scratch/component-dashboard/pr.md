# feat(renderer): add developer tools and interactive component dashboard

## Summary

基础组件分散在不同视图，无法集中检查形态与交互。设置上方新增可悬停/点击/键盘操作的Tools入口，进入类型安全 `/dev/components` 路由；4类收录8组已实现基础组件/图标，直接复用真实组件，支持全量索引、搜索、状态演示及局部重置。开发者区域固定中文，沿用主题/token。

视图导航先检查输入意图、冻结并flush，完成后再次准入；未完成附件/引用及失败请求保留原Composer，避免丢掉异步插入。工具页保留Thread资源，无关模型通知保持位置，返回会话恢复草稿。依据[spec](spec.md)、[01](issues/01-tools-routing.md)、[02](issues/02-component-gallery.md)。

## Evidence

[验证记录](validation.md)：完整check（824单测、35architecture、93tooling通过，2项跳过）、19项真实Renderer Electron检查、最终build/package与4项包内原生工作台检查。TDD先证实目标缺口，再实现；Spec/Standards独立[评审](review.md)发现并修复一个附件准入P2，复审无遗留高价值问题。候选源232f76bcce22e37e6cf765298d9d6f15af8817ec，dirty=false，[身份](evidence/candidate.json)。系统IME/VoiceOver及真实provider未覆盖，用户认可pending。

## Merge Danger

Two-way：纯应用视图/路由与局部准入，无数据迁移、权限或新依赖；回滚此范围即可撤销入口和看板。影响一级功能栏、注册路由及Composer工具导航准入；未完成输入拒绝切换，Thread选择/关闭/执行合同保持既有行为。未公开发布；本地草稿，尚未push或创建远端PR。合并不代表用户认可。
