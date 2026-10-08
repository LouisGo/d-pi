# 附件语义证据来源

最终源码 `e0c43e507554ee09268eef3fa050b906f698d8af`，反馈增量基点 `dd8d8124f26326aa3787c96676ef77fafa2fc4d4`，任务总基点 `a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`。

- images-red：dd8d812 固定归档上的修正 fixture，3项实际行为失败。不是最初缺方法的准备错误。
- settlement-red：daf1f7d 固定归档，修正为共享 adoption 后，重复import结算 disposition 和 image cleanup ACK 两项实际失败；其余7项跳过。
- MIME worker：独立树由 dd8d812 开始，提交68a8b99串行集成为daf1f7d。MIME red 2失败/5通过；原型key red 1失败/35通过；worker green 50项。最终 root 回归包含这些文件，数字不重复相加。
- review-red：最终修正 fixture 在 fec2290 固定归档重放，10失败/33通过。包括 metadata reload 正确产品文案；不把最初“Retry”误写的测试准备错误计作产品红灯。
- real-main-red：在1b50c88归档，复制6个新增行为反例（4文件），真实Main/Renderer lease、saved投影、空行、冻结source准备和SQLite持久采用均失败；52项不相关测试跳过。固定SDK resources仅为同一已声明18.4.6依赖，未复制不同源码的构建输出。
- label-projection-red：实际源码WIP加入source分桶/readonly image projection之后，真实文件label刷新仍将图片canonical移至尾部，1失败/16跳过；最终cache同时排除纯标签与结构投影写入。
- thread-readiness-red：63e023e上的正式Thread反例，移除真实失败源后冻结原文中的同token仍错误阻止准备，1失败/1通过。
- green：最终50文件369项通过，覆盖input全模块、workbench、renderer Thread装配、Main history/clipboard，以及真实SQLite资源生命周期和legacy mixed clipboard。真实SDK PDF单列，不混入此通过数字。
- previous-sdk-pdf-failure：未改1b50c88在相同Node/固定SDK资源上重跑既有SDK PDF复制用例，同样failed；extended-clipboard为本次该14项集合的13通过/1失败与legacy mixed clipboard1项通过。PDF回包为clipboard-unavailable/failed，根因未定位，未修改SDK或掩盖fixture。
- impeccable.json：本轮MIME/内联UI指定文件的源码detector结果为[]，是源码检查，不能作截图或视觉验收。

日志保留原stdout和stderr，包括ANSI、React act警告、路由工具警告。完整 pnpm check 未重跑；先前CLI fixture失败保留。用户要求自行实机验收，本轮未启动Dev、GUI或E2E，没有新增截图或真实IME证明。
