# 07 同任务复测与交接

Status: claimed
Blocked by: none

阶段：既有 M1 重写。授权、待决项与继续边界见 [spec](../spec.md#推进与交接)。受影响决定：D-05、D-17、D-21/D-22、D-24、D-28–D-37 与 B-01，按实际触及项核对。

## 交付与验收

重要波次冻结后独立审阅；针对性修复、完整 check/build、受影响 SDK/包/GUI。五个任务同描述新上下文复测；明确真实/合成、用户待试用及后续边界。不 push/发布/S5/M2。

## Comments

2026-09-30：从准备提交的干净 `codex/rewrite-core` 开始；不维持旧内部类/补丁形态，但保持正确的产品合同、事务、恢复与执行所有权。完成后记录实际验证、未覆盖项与提交。

已完成第一轮冻结核心审阅并修复两项已证实问题（Renderer 收据合法变体与 tool start 开放字段消费），见 04/06。准备冻结 05 后审阅工作区/查询/输入完整路径；最终包从干净已提交源码构建，不以早期导出目录的 unknown-dirty 标识交付。

基线本地查询已在 Electron 依赖准备稳定后按原题、独立新上下文补跑；目标两项先红后绿，相关 15 项、完整 check/build 通过。观察用时 529.601 秒，原轮 309.311 秒，两次差异同时记录，不能择优宣称效率提升。实现限于隔离对照目录，未搬回生产源码；五组复测将在明确冻结提交上另开上下文。具体判定、原始验证与限制收尾记录。

随包验证使用独立 App/OMP/项目、localhost provider fixture 和迁移后的带空格 bundle 路径。复用 `validation/s3/package.mjs` 的正式包入口，补实际原生写工具、混合换行原文及 Diff 选区、冻结引用、窗口重载、ACK 后原生进程中断/unknown 不重发与冷重开只读；实际执行与后续补修见下文。

第二轮独立审阅完成：31/31 冻结文件 hash 匹配，未发现可证实的新缺陷；18 文件 93 项既有测试及两项独立构造失败/迟到 prepare 负例通过，core/renderer tsc 通过。未以审阅的 Node doubles 冒称真实 GUI。

`f5e998f` 干净包实际完整链通过：真实写工具与两轮同 session、v1 迁移、混合换行选区/当前 Diff、窗口重载、语言切换保留编辑器、主题/密度，以及 ACK 后中断保留 unknown。冷重开同 native binding、provider 调用数仍 4、无 native writer，草稿编辑、文件和原生历史仍可用；主 Agent 已看截图并核对同 trace prepared→dispatching→acknowledged→outcome unknown 与单独 Host exited。模型是本地 fixture，未证明真实供应商。脚本两项问题（DOM 对象序列化、误选 Monaco 0.57 隐藏 IME textarea）已定位为验证入口，修正后上述断言通过。

截图复核发现单独 CR 在引用预览中连行；数据原文与冻结收据正确，仍需补显示。目标测试先真实失败后，input 仅将 DOM 预览换行规范化，renderText/attrs/草稿仍保持原字节；4 文件 17 项、renderer tsc、Biome 与设计 lint 通过，完整 `pnpm check` 通过（343 项 Vitest + 1 项跳过、37 项 Node 门禁）。包将重建并复核这个可见补修；此前 `f5e998f` 包不作为最终交付。冷启动复测点仍为明确的 f5e998f，后续差异只按实际说明。

随包入口另补 CDP 驱动真实浏览器 compositionstart/end 的发送阻止检查，目前仅语法、格式与快速门禁通过，尚待重建包执行；不把 CDP 组合事件等同于 macOS 中文输入法候选界面或用户输入手感验收。
