# feat(renderer): add developer workspace and interactive component dashboard

## Summary

基础组件分散，无法集中查看形态与交互。设置上方Tools菜单可悬停/点击/键盘打开，进入注册的 `/dev/components` 独立开发者工作区，覆盖Thread列表及内容区，只共享一级功能栏/native标题栏/history/theme。左侧真实组件预览，右侧常驻竖向分组锚点；搜索同步过滤目录和内容，互动组件独立重置，固定中文/共享主题。

图标从本项目公开Icon Layer自动收录，新增普通图标及类别模块不额外维护看板名单，只作20px静态预览。工具导航先检查附件/引用输入意图，再冻结/flush并复查，未完成输入保留原Composer；工具页保留Thread资源和布局意图，返回恢复会话。依据[spec](spec.md)及[03反馈票](issues/03-dashboard-feedback.md)。

## Evidence

[验证](validation.md)：完整check（826单测、35architecture、93tooling通过，2项跳过），26项真实Renderer Electron检查（独立工作区、右侧目录常驻/锚点、宽中窄、真实交互和返回资源/侧栏宽度），最终production build/目录包与4项包内原生工作台检查。目标缺口先真实失败再实现；两轮Spec/Standards独立[评审](review.md)无遗留高价值问题。候选源e97c5a05e40fc27ef809ee551943b1be5010c068，dirty=false，[身份](evidence/feedback/candidate.json)。包内交互覆盖层级及系统IME/VoiceOver/真实provider未覆盖项见验证记录；用户认可pending。

## Merge Danger

Two-way：应用视图/路由元信息与局部准入，无数据迁移、权限或新依赖；撤销本范围即可撤销入口和看板。影响一级功能栏、Route工作区布局及Composer工具导航准入；卸载仅视图资源，Thread/OMP/存储归属和原选择/关闭规则不变。Icon Layer全量本项目导入仅开发者看板例外，产品消费者继续静态具名。原main未改动，本地草稿未push/建远端PR；合并不代表用户认可。
