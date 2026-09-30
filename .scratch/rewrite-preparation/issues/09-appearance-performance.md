# 09 外观偏好的订阅与更新边界

Status: claimed
Blocked by: none

2026-09-30 用户指出顶层全量状态订阅削弱按需订阅，明确要求修复主题、密度等展示偏好的性能隐患，并以项目 skill 提醒后续 AI。从 `992ceee` 的干净 `codex/rewrite-core` 开始，授权实现、必要测试依赖、验证、受影响 GUI 与本地提交；不 push。

## 范围与不变量

- App 的阶段、工作资源、偏好工具栏与提示各按真实消费选择订阅；外观保存的 busy/结果不得使无关工作内容重新渲染。变化的 Thread、正文和业务状态仍正常更新。
- Composer 的初始文档仅按编辑器初始化身份构造，重挂载读取当前 pending 草稿；附件、IME、撤销及旧回调边界保持。
- 根主题/密度标记只写真实变化；Monaco 区分颜色与尺寸，消除无关主题重建和重复布局，清理后不执行悬挂操作。文件 model、选区和原文身份保持。
- 保留保存成功后应用偏好的现有行为与失败处理；不实施字号功能、乐观保存、全局缩放或新产品行为。不改变 OMP、收据、权限、事务和恢复门槛。
- state-query skill 维护订阅与父级渲染边界，design-system skill 维护外观/测量适配，两者进入现有功能接入路由，不新增平行规范。

## 分工与验收

主 Agent 管共享依赖、配置、skill/文档、集成、GUI 和 Git。React 子 Agent 写 app Renderer 与相关测试；Monaco 子 Agent 写 files Renderer 的内部适配与相关测试。同一文件只有一个写入者。

按 TDD 先证明目标缺口，再最小实现；React 使用真实挂载与 Zustand 更新观察无关子树和控制响应，Monaco 在适配边界观察主题/布局/清理。既有正确行为补测不伪造红灯。验证包括相关测试、完整 check/build、实际切换和编辑器状态保留；性能收益需依据实际计数/耗时，不以 selector 或 memo 的数量代替结果。

## 执行证据

2026-09-30：实现和自动检查、开发态实际 GUI 已完成；干净源码正式构建及交付核对继续由主 Agent 执行。状态由本票和上级 spec 维护，原重写 handoff 仍是原构建快照。

- **TDD**：两个实现子 Agent 分别先观察全量订阅、重复属性写入、重复初始文档计算，以及 Monaco 颜色/尺寸耦合的失败，再最小实现。随后主 Agent 在独立 `992ceee` 源码目录，只复制本轮三个测试与 Vitest 配置作可复查对照：9 个目标行为断言实际失败；当前源码同题 9 个通过，另 15 个因过滤跳过，非套件遗漏。[基线红灯](../evidence/appearance-red.txt)、[当前绿灯](../evidence/appearance-green.txt)。既有 Thread、失败、语言和准确选区行为补测直接通过，不伪造红灯。
- **可观察收益**：theme 保存的 busy 与成功通知不再执行六个无关业务边界；sendKey 保存的外观属性事件由 2 次变成 0；同一 mounted controller 的草稿更新不再重复 `draftDocument`。Monaco 只在真实 theme 改变时重设颜色，密度只经真实尺寸观察触发布局，多次变化按帧合并，卸载取消并拒绝迟到回调。
- **集成**：目标工具链 Node `24.21.0` / pnpm `10.5.2`，完整 `pnpm check` 通过（364 项 Vitest + 1 项原生 opt-in 跳过；27 项架构 + 10 项工具门禁）。`pnpm build` 通过，保留既有上游 PURE 注释及大 chunk 提示。三份受影响 skill 通过 `quick_validate.py`，文档引用与结构生成报告通过。新增 exact `happy-dom@20.14.5` 仅用于真实 React DOM 挂载；默认 Node 测试环境保持。
- **独立审阅**：冻结实现/测试/skill 与配置后，第三个只读 Agent 检查真实消费、旧 Thread/附件、初始化身份和 Monaco 尺寸/释放；独立 26 项相关测试通过，未发现可行动缺陷。主 Agent 核对最终 diff，不将审阅结论替代真实编辑器证据。
- **开发态 GUI**：`validation/appearance.mjs` 运行实际构建 Electron、独立 App/OMP/Git 目录，无认证与执行许可。180 行文件、18 行草稿，文件与 Diff 各 6 次 theme / 6 次 density 切换；编辑器 DOM 身份、草稿、选区、两种编辑器滚动、几何、附件和真实 undo 保留，未创建 OMP session。主 Agent 已查看开发态深色/紧凑截图；[干净基线](../evidence/appearance-baseline.json)和[候选构建](../evidence/appearance-candidate.json)保留完整聚合计数/耗时。候选 profile 与另一目录构建部分重叠，文件 theme 的聚合耗时增加；不据此声称时延提升。正式构建的复核另记下方，短样本不代表帧时分布或用户体验验收。

## 交付与未覆盖

待补正式产物、实际构建身份、GUI 截图与启动步骤。不实现字号偏好，相关 skill 只约束后续设计；未验证系统 IME、真实供应商、Windows/Linux、M2 大内容性能或用户手感。不改变偏好保存失败行为、OMP 执行所有权、unknown 不重发与缺单写证据只读的继续边界。
